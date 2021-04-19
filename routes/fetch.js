const express = require('express');
const Joi = require('joi');
const router = express.Router();
const mongoose = require('mongoose');
const {Trade, tradeSchema, validate}= require('../models/trade');
const {Stock, stockSchema} = require('../models/stock');
const currentPrice = 500;

//fetch trades.
router.get('/trades', async (req, res)=>{
    const result = await Trade.find().select('-__v');
    res.send(result);
});

//fetch portfolio
router.get('/portfolio', async (req, res)=>{
    const result = await Stock.find().select('-__v');
    res.send(result);
});

//fetch returns
router.get('/returns', async (req, res)=>{
    const portfolio = await Stock.find().select('tickerSymbol avgBuyPrice shares');
    let returns = {
        cumulativeReturns: 0
    };
    for(let i in portfolio){
        returns.cumulativeReturns += (currentPrice - portfolio[i].avgBuyPrice)*portfolio[i].shares;
    }
    res.send(returns);
});
module.exports.fetchRouter = router;