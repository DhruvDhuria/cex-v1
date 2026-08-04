import type { AssetOrderBook, UserBalance} from "../types"
import { OrderType, OrderSide } from "../generated/prisma/enums";
import { useReducer } from "react";

export const BALANCES: UserBalance[] = [
  /*
  {
    userId = number
    usd_balance = number,
    lockedBalance = number
    BTC: 30,
    SOL: 48
  } 
  */
];

type OrderBookSchema = Record<string, AssetOrderBook>;
export const ORDERBOOKS: OrderBookSchema = {
  SOL: {
    asks: [],
    bids: [],
  },
  BTC: {
    asks: [],
    bids: [],
  },
};


// things i will need in the matching engine? order side
export function matchEngine({type, side, qty, market, price, userId}: {type: OrderType, side: OrderSide, qty: number, market: "SOL" | "BTC", price?: number, userId: string}) {

    ORDERBOOKS[market]!.asks.sort((a, b) => a.price - b.price)
    ORDERBOOKS[market]!.bids.sort((a, b) => b.price - a.price)

    let filledQty = 0
    const user = BALANCES.find((u) => u.userId === userId);
    if (!user) {
      return { error: "User not found" };
    }
    if (type === "MARKET") {
      // how will we check the balance
      const asset = ORDERBOOKS[market]!;
      
      if(side === "BUY"){

        if(!asset.asks[0]) {
          return {error: "No asks price at this time"};
        }
        const marketPrice = asset.lastTradedPrice
          ? asset.lastTradedPrice
          : asset.asks[0].price;

        if (!marketPrice) {
          return { error: "trading has not started yet in the market segment" };
        }

        const estimatedPrice = marketPrice * qty
        const bufferPrice = estimatedPrice * 0.03

        if (user.usdBalance < estimatedPrice + bufferPrice) {
          return { error: "Insufficient balance" };
        }
        
        user.usdBalance -= estimatedPrice + bufferPrice 
        user.lockedBalance += estimatedPrice + bufferPrice
        
        let count = 0;
        let orderCount = 0;
        let delta;

        const priceAggregate = []


        while(qty !== filledQty) {
          delta = qty - filledQty

          
          if(asset.asks[count]!.totalQty === 0) {
            count++
            if(!asset.asks[count]){
              if(delta) {
                user.usdBalance += user.lockedBalance
                user.lockedBalance = 0
                return {filledQty, priceAggregate}
              }

            }
            orderCount = 0
          }

          let availableAsk = asset.asks[count]!.orders[orderCount]!
          let sellerId = availableAsk.userId
          const seller = BALANCES.find(u => u.userId === sellerId)

          if(!seller) {
            user.usdBalance += user.lockedBalance;
            user.lockedBalance = 0;
            return { filledQty, priceAggregate, error:"Seller not found" };
            
            
          }

          const matchedOrders = Math.min(availableAsk.qty, delta)
          const levelPrice = asset.asks[count]?.price!;
          
          const deductableAmt = levelPrice * matchedOrders
          if(availableAsk.qty <= delta) {
            user.lockedBalance -= deductableAmt
            user[market] += availableAsk.qty
            filledQty += availableAsk.qty
            seller.usdBalance += deductableAmt
            seller.lockedAsset[market] -= availableAsk.qty
            priceAggregate.push({levelPrice, matchedOrders})
            asset.asks[count]!.totalQty -= availableAsk.qty
            availableAsk.qty = 0

            asset.asks[count]?.orders.splice(orderCount, 1)
          } else if(availableAsk.qty > delta) {
            user.lockedBalance -= deductableAmt

            user[market] += delta
            filledQty += delta

            seller.usdBalance += deductableAmt
            availableAsk.qty -= delta
            seller.lockedAsset[market] -= delta
            priceAggregate.push({ levelPrice, matchedOrders });

            asset.asks[count]!.totalQty -= delta
            orderCount++
          }

          
        }
        
        user.usdBalance += user.lockedBalance
        user.lockedBalance = 0

        return {filledQty, priceAggregate }              
      }else {
        if(!asset.bids[0]) {
          return {error: "No bids at this time"}
        }

        if(user[market] < qty ) {
          return {error: "insufficient Balance"}
        }

        user[market] -= qty
        user.lockedAsset[market] += qty
        
        let count = 0;
        let orderCount = 0;
        let delta;

        const priceAggregate = [];

        while (qty !== filledQty) {
          delta = qty - filledQty;

          
          if (asset.bids[count]!.totalQty === 0) {
            count++;
            if (!asset.bids[count]) {
              
              user[market] += user.lockedAsset[market];
              user.lockedAsset[market] = 0;
              return { filledQty, priceAggregate };
              
            }
            orderCount = 0;
          }

          let availableBid = asset.bids[count]!.orders[orderCount]!
          let buyerId = availableBid.userId;
          const buyer = BALANCES.find((u) => u.userId === buyerId);


          if (!buyer) {
            user[market] += user.lockedAsset[market];
            user.lockedAsset[market] = 0;
            return { filledQty,priceAggregate, error: "Buyer not found" };
          }

          const matchedOrders = Math.min(availableBid.qty, delta)
          const levelPrice = asset.bids[count]!.price

          const tradeAmount = levelPrice * matchedOrders
         if(availableBid.qty <= delta) {
          buyer.lockedBalance -= tradeAmount
          buyer[market] += availableBid.qty
          filledQty += availableBid.qty
          user.lockedAsset[market] -= availableBid.qty
          user.usdBalance += tradeAmount
          priceAggregate.push({ levelPrice, matchedOrders });
          asset.bids[count]!.totalQty -= availableBid.qty;
          availableBid.qty = 0;

          asset.bids[count]!.orders.splice(orderCount, 1);
         }else if(availableBid.qty > delta) {
          buyer.lockedBalance -= tradeAmount;

          buyer[market] += delta;
          filledQty += delta;

          user.usdBalance += tradeAmount;
          availableBid.qty -= delta;
          user.lockedAsset[market] -= delta;
          priceAggregate.push({ levelPrice, matchedOrders });

          asset.bids[count]!.totalQty -= delta;
          orderCount++;
         }
        }

        user[market] += user.lockedAsset[market];
        user.lockedAsset[market] = 0;

        return { filledQty, priceAggregate }; 
      }
    }
    
}