const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const {Trade, tradeSchema, validate}= require('../models/trade');
const {Stock, stockSchema} = require('../models/stock');

//adding a new trade router
router.post('/', (req, res)=>addTrade(req, res));

// remove a trade router
router.delete('/:tradeId', (req, res)=>removeTrade(req,res));

//update a trade router
router.put('/:tradeId', async (req, res)=>{

    //order: tickerSymbol -> tradetype -> shares -> price
    //find old trade to be changed.
    const oldTrade = await Trade.findById(req.params.tradeId);
    if(!oldTrade) return res.status(404).send('Could not find any trade with the given id.');
    
    const newTrade = new Trade({
        tickerSymbol:(req.body.tickerSymbol ? req.body.tickerSymbol : oldTrade.tickerSymbol),
        tradeType:(req.body.tradeType ? req.body.tradeType : oldTrade.tradeType),
        shares:(req.body.shares ? req.body.shares : oldTrade.shares),
        price:(req.body.price ? req.body.price : oldTrade.price),
    });
    //validate input first
    const { error } = validate(newTrade);
    if(error) return res.status(400).send(error.details[0].message);

    //if there is change in ticker symbol
    if(newTrade.tickerSymbol!= oldTrade.tickerSymbol){
        //check if it is okay to remove the old trade.
        //snaphot of old trade portfolio.
        const oldStock = await Stock.findOne({tickerSymbol: oldTrade.tickerSymbol});
        //if buy, check if old stock has sufficient shares to revert
        if(oldTrade.tradeType=='buy' && oldStock.shares<oldTrade.shares) return res.status(400).send('insufficient shares to remove old trade.');
        
        //check if new trade can be added.
        let newStock = await Stock.findOne({tickerSymbol:newTrade.tickerSymbol});
        //if sell, check shares present and the stockexists too.
        if(newTrade.tradeType=='sell'){
            if(!newStock) return res.status(400).send('Entered stock does not exist.');
            if(newStock.shares < newTrade.shares) return res.status(400).send('insufficient shares to execute new trade.');
        }

        //all is well now. remove the old trade and add the new.
        let oldAvgBuyPrice = oldStock.avgBuyPrice;
        let oldShares = oldStock.shares;
        //adjust abp and shares differently for buy. if sell, go with the above specified.
        if(oldTrade.tradeType =='buy'){
            if(oldStock.shares - oldTrade.shares >0)
                oldAvgBuyPrice = ((oldStock.avgBuyPrice*oldStock.shares) - (oldTrade.price*oldTrade.shares))/(oldStock.shares - oldTrade.shares);
            else if(oldStock.shares == oldTrade.shares)
                oldAvgBuyPrice = 0;
            
            oldShares *= -1;
        }
        //remove old trade.
        await Stock.findOneAndUpdate({tickerSymbol: oldTrade.tickerSymbol} ,{
            $set:{avgBuyPrice: oldAvgBuyPrice},
            $inc:{ shares: oldShares },
            $pull:{trades:{_id: oldTrade._id}}
        }, {new:true}).catch((error)=>res.send(error.message));
        await Trade.findOneAndRemove({_id:oldTrade._id});

        //if stock doesnt exist.
        if(!newStock){
            newStock = new Stock({tickerSymbol:newTrade.tickerSymbol});
            await newStock.save();
        }

        let newAvgBuyPrice =newStock.avgBuyPrice;
        let newShares = newTrade.shares*-1;
        //adjust abp and shares differently for buy. if sell, go with the above specified.
        if(newTrade.tradeType == 'buy'){
            newAvgBuyPrice = ((newStock.avgBuyPrice*newStock.shares) + (newTrade.price*newTrade.shares)) / (newStock.shares + newTrade.shares);
            newShares *= -1;
        }
        //update portfolio and add trade
        const result = await Stock.findOneAndUpdate({tickerSymbol: newTrade.tickerSymbol},{
            $set:{avgBuyPrice: newAvgBuyPrice},
            $inc:{ shares:newShares },
            $push:{ trades:newTrade }
        }, {new:true});
        await newTrade.save();
        return res.send(result);
    } else if(newTrade.tradeType != oldTrade.tradeType){
        const snapStock = await Stock.findOne({tickerSymbol:newTrade.tickerSymbol});
        // buy -> sell
        if(oldTrade.tradeType == 'buy' && (snapStock.shares - oldTrade.shares - newTrade.shares < 0)) return res.status(400).send('Insufficient shares to change trade.');
        //if sell
        let newShares = (oldTrade.shares + newTrade.shares);
        let newAvgBuyPrice = ((snapStock.avgBuyPrice*(snapStock.shares+oldTrade.shares)) + (newTrade.shares*newTrade.price)) / (snapStock.shares + oldTrade.shares + newTrade.shares);

        if(oldTrade.tradeType == 'buy'){
            newShares *= -1;
            newAvgBuyPrice = ((snapStock.avgBuyPrice*snapStock.shares) - (oldTrade.price*oldTrade.shares)) / (snapStock.shares - oldTrade.shares);
        }

        // delete oldTrade
        await Trade.findOneAndRemove({_id:oldTrade._id});

        //update
        await Stock.findOneAndUpdate({tickerSymbol: oldTrade.tickerSymbol},{
            $pull:{trades:{_id: oldTrade._id}}
        }, {new:true});
        const result = await Stock.findOneAndUpdate({tickerSymbol: newTrade.tickerSymbol},{
            $set:{avgBuyPrice: newAvgBuyPrice},
            $inc:{ shares:newShares },
            $push:{ trades:newTrade },
        }, {new:true});
        
        await newTrade.save();
        return res.send(result);

    } else if(oldTrade.shares != newTrade.shares){
        const snapStock = await Stock.findOne({tickerSymbol:newTrade.tickerSymbol});
        //sell
        let changeInShares =  oldTrade.shares - newTrade.shares;
        let newAvgBuyPrice = snapStock.avgBuyPrice;
        //buy
        if(oldTrade.tradeType == 'buy'){ 
            changeInShares *= -1;
            if(!(snapStock.shares + changeInShares)) 
                newAvgBuyPrice = 0;// handles the scenario where denominator becomes infinity in newAvgBuyPrice.
            else
                newAvgBuyPrice = ((snapStock.avgBuyPrice*snapStock.shares) + (newTrade.price*newTrade.shares) - (oldTrade.price*oldTrade.shares)) / (snapStock.shares + changeInShares);
        }
        
        if(snapStock.shares + changeInShares < 0) return res.status(400).send('Insufficient shares to change trade.');

        //remove old trade
        await Trade.findOneAndRemove({_id:oldTrade._id});
        
        //update abp and shares
        await Stock.findOneAndUpdate({tickerSymbol: oldTrade.tickerSymbol},{
            $pull:{trades:{_id: oldTrade._id}}
        }, {new:true});
        const result = await Stock.findOneAndUpdate({tickerSymbol: newTrade.tickerSymbol},{
            $set:{avgBuyPrice: newAvgBuyPrice},
            $inc:{ shares:changeInShares },
            $push:{ trades:newTrade },
        }, {new:true});
        await newTrade.save();
        return res.send(result);
    } else if(oldTrade.price != newTrade.price) {
        const snapStock = await Stock.findOne({tickerSymbol:newTrade.tickerSymbol});
        let newAvgBuyPrice = snapStock.avgBuyPrice;
        if(oldTrade.tradeType == 'buy') 
        newAvgBuyPrice = ((snapStock.avgBuyPrice*snapStock.shares) + ((newTrade.price - oldTrade.price)*oldTrade.shares)) / snapStock.shares;

        //delete old trade.
        await Trade.findOneAndRemove({_id:oldTrade._id});
        //update abp 
        await Stock.findOneAndUpdate({tickerSymbol: oldTrade.tickerSymbol},{
            $pull:{trades:{_id: oldTrade._id}}
        }, {new:true});
        const result = await Stock.findOneAndUpdate({tickerSymbol: newTrade.tickerSymbol},{
            $set:{avgBuyPrice: newAvgBuyPrice},
            $push:{ trades:newTrade },
        }, {new:true});
        await newTrade.save();
        return res.send(result);
    } else {
        return res.status(400).send('It is same as old trade. Nothing to change.');
    }
});

//remove a trade function
async function removeTrade(req, res){
    //fetch the trade
    const trade = await Trade.findById(req.params.tradeId);
    if(!trade) return res.status(404).send('Could not find any trade with the given id.');
    
    //make changes in portfolio
    if(trade.tradeType=='buy'){
        //snapshot of the stock in portfolio
        const snapStock = await Stock.findOne({tickerSymbol: trade.tickerSymbol});
        //if there are fewer shares now. cannot revert the changes.
        if(snapStock.shares<trade.shares) return res.status(400).send('Insufficient shares. Cannot revert the trade.');
        //if we remove the last existing trade, then denominator in the avgBuyPrice becomes zero.
        // to avoid that, we set abp to zero instead of infinity.
        let newAvgBuyPrice = 0;
        if(snapStock.shares - trade.shares >0)
            newAvgBuyPrice = ((snapStock.avgBuyPrice*snapStock.shares) - (trade.price*trade.shares))/(snapStock.shares - trade.shares);
        
        //reverting.
        const result = await Stock.findOneAndUpdate({tickerSymbol: trade.tickerSymbol} ,{
            $set:{avgBuyPrice: newAvgBuyPrice},
            $inc:{ shares:trade.shares*-1 },
            $pull:{trades:{_id: trade._id}}
        }, {new:true}).catch((error)=>res.send(error.message));
        await Trade.findOneAndRemove({_id:trade._id});
        return res.send(result);
    } else {
        // for sell type
        const result = await Stock.findOneAndUpdate({tickerSymbol: trade.tickerSymbol} ,{
            $inc:{ shares:trade.shares },
            $pull:{trades:{_id: trade._id}}
        }, {new:true}).catch((error)=>res.send(error.message));
        await Trade.findOneAndRemove({_id:trade._id});
        return res.send(result);
    }   
}

//add a trade function
async function addTrade(req, res){
     //validate input first.
     const trade = new Trade({
        tickerSymbol:req.body.tickerSymbol, 
        shares:req.body.shares, 
        price:req.body.price, 
        tradeType:req.body.tradeType
    });
    
    const { error } = validate(trade);
    if(error) return res.status(400).send(error.details[0].message);
    const stock = await Stock.findOne({tickerSymbol : trade.tickerSymbol}).limit(1).select('tickerSymbol shares');
    
    if(trade.tradeType =='buy'){
        if(!stock){
            //create new stock in portfolio.
            const stock = new Stock({tickerSymbol:trade.tickerSymbol,});
            await stock.save();
        }

        //add trade to existing portfolio and update abp and shares qty
        const snapStock = await Stock.findOne({tickerSymbol: trade.tickerSymbol});
        
        //update abp and shares
        const result = await Stock.findOneAndUpdate({tickerSymbol: trade.tickerSymbol},{
            avgBuyPrice :((snapStock.avgBuyPrice*snapStock.shares) + (trade.price*trade.shares)) / (snapStock.shares + trade.shares),
            $inc:{ shares:trade.shares },
            $push:{ trades:trade }
        }, {new:true});
        await trade.save();
        return res.send(result);
    }
    //when selling.
    //when no such stock owned.
    if(!stock) return res.status(404).send('Stock not found to sell.');
    //when quantities of stock are insufficient to sell.
    if(stock.shares<trade.shares) return res.status(400).send('insufficient quantity to sell.');

    // if there are sufficient quantities of stock present to sell
    const result = await Stock.findOneAndUpdate({tickerSymbol: trade.tickerSymbol},{
        $inc:{ shares:trade.shares*-1 },
        $push:{ trades:trade }
    }, {new:true});
    await trade.save();
    return res.send(result);
}

module.exports.tradeRouter = router;