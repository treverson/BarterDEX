import { observable, action } from 'mobx';
import { ipcRenderer } from 'electron';
import React from 'react'


import formatCurrency from 'format-currency';
import { colors } from '../constants'
import { coinName } from '../app/helpers'
import * as Icon from 'react-cryptocoins';
import MNZ from '../app/static/coins/mnz.svg';


const capitalize = (string) => string.toLowerCase().charAt(0).toUpperCase() + string.slice(1).toLowerCase()


const addIcons = (coins) => coins.map((item) => {
    let coin = item.coin;
    coin = capitalize(coin);

    if (coin === 'Kmd') { coin = 'KmdAlt'; } else {
        coin = capitalize(coin);
    }

    if (Icon[coin]) {
        const TagName = Icon[coin];
        item.icon = (<TagName />);
        item.hasSVGIcon = true;
    } else if (coin === 'Mnz') {
        item.icon = (<i className={`coin-icon-svg ${item.coin}`} dangerouslySetInnerHTML={{ __html: MNZ }} />)
        item.hasSVGIcon = true;
    } else {
        item.icon = (<i className={`coin-icon-placeholder ${item.coin}`}>{ item.coin[0] }</i>)
        item.hasSVGIcon = false;
    }

    item.name = coinName(item.coin);
    return item;
})


export default class PortfolioStore {
     @observable portfolio = [];
     @observable coinsList = [];
     @observable installedCoins = [];
     @observable tradeBase = false;
     @observable tradeRel = false;
     @observable withdrawConfirm = false;

     @observable fiatRates = {
         eur: 3000,
         usd: 4000
     }

     @observable defaultCurrency = {};

    colors = colors;

    constructor({ defaultFiat, defaultCrypto, orderbookStore, marketStore }) {
        this.orderbook = orderbookStore;
        this.market = marketStore;
        this.defaultCurrency = defaultFiat;
        this.defaultCrypto = defaultCrypto;
        this.formatFIAT = { format: '%s%v', symbol: this.defaultCurrency.symbol }
        this.formatCrypto = { format: '%v %c', code: defaultCrypto, maxFraction: 8 };

        this.initializedtradeRel = false;

        const self = this;

        ipcRenderer.on('coinsList', (e, coinsList) => { self.prepareCoinsList(coinsList) });
        ipcRenderer.on('updateTrade', (e, { coin, type }) => { self.updateTrade(coin, type) });
        ipcRenderer.on('trade', (e, result) => { self.tradeCb(result) });
        ipcRenderer.on('confirmWithdraw', (e, result) => { self.withdrawConfirm = result });
        ipcRenderer.on('sendrawtransaction', (e, result) => { self.withdrawConfirm = false });
    }

    getMarket = (short) => this.market.getMarket().filter((asset) => asset.short === short)[0];

    @action getCoin = (short) => this.installedCoins.filter((asset) => asset.coin === short)[0];

    updateTrade = (coin, type) => {
        this.orderbook.killListener();
        this[`trade${type}`] = this.getCoin(coin);

        if (this.tradeBase && this.tradeRel) {
            this.orderbook.listenOrderbook({ base: this.tradeBase.coin, rel: this.tradeRel.coin });
        }
    }

    confirmWithdraw = () => {
        ipcRenderer.send('withdrawConfirm', this.withdrawConfirm)
    }

    /* @params { method, base, rel, price, relvolume }
    */

    @action withdraw = (params) => {
        ipcRenderer.send('withdraw', params)
    }

    @action trade = (params) => {
        ipcRenderer.send('trade', params)
    }


    @action tradeCb = (result) => {
        console.log(result);
    }

    @action prepareCoinsList = (coins) => {
        const self = this;
        const withIcons = addIcons(coins);
        const byIcon = withIcons.slice(0);
        byIcon.sort((a, b) => a.hasSVGIcon ? 0 : 1);
        this.coinsList = byIcon;
        this.installedCoins = addIcons(this.coinsList.filter((coin) => coin.status === 'active').sort((a, b) => a.balance > 0 ? 0 : 1));
        console.log(byIcon)

        if (self.tradeRel) {
            self.tradeRel.balance = self.getCoin(self.tradeRel.coin).balance
        }

        if (self.tradeBase) {
            self.tradeBase.balance = self.getCoin(self.tradeBase.coin).balance
        }
    }

    @action enableElectrum = (coin) => {
        ipcRenderer.send('enableCoin', { coin: coin.coin, electrum: true })
    }

    @action setTrade = (coin, type) => {
        ipcRenderer.send('enableCoin', { coin: coin.coin, type, electrum: !coin.installed })
    }

    @action autoSetTrade = (coin) => {
        // activate the coin and set as rradeBase
        this.setTrade(coin, 'Base');
        // search for the highest balance and activate as tradeRel
        const firstNotSelf = this.coinsList.filter((installed) => installed.coin !== coin.coin)[1];

        this.setTrade(firstNotSelf, 'Rel');
    }


    @action refresh = () => { ipcRenderer.send('refreshPortfolio') }

    @action renderBalance = (short) => {
        const opts = { format: '%v %c', code: short, maxFraction: 8 };
        const coin = this.getCoin(short);
        if (coin) {
            return formatCurrency(coin.balance, opts)
        }

        return 0;
    }


    portfolioRenderFIAT = (coin, wrap) => {
        const self = this;
        const amount = coin.KMDvalue;
        let result = '';

        const KMD = this.getMarket('KMD');

        if (KMD) {
            const price = KMD.price;
            return formatCurrency(amount * price, self.formatFIAT)
        }

        if (result && wrap) {
            result = `(${result})`;
        }

        return result;
    }

    get24hEvolution = (short) => {
        const coin = this.getCoin(short);
        return coin.perc;
    }

    @action kmdTotal = (format = true) => {
        const self = this;
        /* call reduce() on the array, passing a callback
        that adds all the values together */
        const amount = self.installedCoins.reduce((accumulator, coin) => {
            if (coin.KMDvalue) {
                return accumulator + coin.KMDvalue
            }
            return accumulator
        }, 0);
        if (format) {
            return formatCurrency(amount, self.formatCrypto)
        }

        return amount;
    }

    portfolioTotal = (format = true) => {
        const self = this;
        /* call reduce() on the array, passing a callback
        that adds all the values together */
        const amount = self.portfolio.reduce((accumulator, coin) => accumulator + coin[self.defaultCurrency.type], 0);
        if (format) {
            return formatCurrency(amount, self.formatFIAT)
        }

        return amount;
    }

    portfolioEvolution = () => {
        const self = this;
        const total = self.portfolio.reduce((accumulator, coin) => accumulator + ((coin[self.defaultCurrency.type] * coin.perc) / 100), 0);
        return ((total / this.portfolioTotal(false)) * 100).toFixed(2);
    }


    @action leave = () => {
        const self = this;
        self.tradeBase = false;
        self.tradeRel = false;
    }

}
