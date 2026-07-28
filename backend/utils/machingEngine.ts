import type { AssetOrderBook, UserBalance} from "../types"
import { OrderType, OrderSide } from "../generated/prisma/enums";
import { useReducer } from "react";

const BALANCES: UserBalance[] = [
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
const ORDERBOOKS: OrderBookSchema = {
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
function matchEngine({type, side, qty, market, price, userId}: {type: OrderType, side: OrderSide, qty: number, market: "SOL" | "BTC", price?: number, userId: string}) {

    ORDERBOOKS[market]!.asks.sort((a, b) => a.price - b.price)
    ORDERBOOKS[market]!.bids.sort((a, b) => b.price - a.price)

    let filledQty = 0
    if (type === "MARKET") {
      // how will we check the balance
      const user = BALANCES.find((u) => u.userId === userId);
      if (!user) {
        return { error: "User not found" };
      }
      const asset = ORDERBOOKS[market]!;
      if(!asset.asks[0]) {
        return {error: "No asks price at this time"};
      }
      

      if(side === "BUY"){
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

          let availableUser = asset.asks[count]!.orders[orderCount]!
          let sellerId = asset.asks[count]?.orders[orderCount]?.userId
          const seller = BALANCES.find(u => u.userId === sellerId)

          if(!seller) {
            user.usdBalance += user.lockedBalance;
            user.lockedBalance = 0;
            return { filledQty, priceAggregate, error:"Seller not found" };
            
            
          }

          const matchedOrders = Math.min(availableUser.qty, delta)
          const levelPrice = asset.asks[count]?.price!;
          
          const deductableAmt = levelPrice * matchedOrders
          if(availableUser.qty <= delta) {
            user.lockedBalance -= deductableAmt
            user[market] += availableUser.qty
            filledQty += availableUser.qty
            seller.usdBalance += deductableAmt
            priceAggregate.push({levelPrice, matchedOrders})
            asset.asks[count]!.totalQty -= availableUser.qty
            availableUser.qty = 0

            asset.asks[count]?.orders.splice(orderCount, 1)
          } else if(availableUser.qty > delta) {
            user.lockedBalance -= deductableAmt

            user[market] += delta
            filledQty += delta

            seller.usdBalance += deductableAmt
            availableUser.qty -= delta

            priceAggregate.push({ levelPrice, matchedOrders });

            asset.asks[count]!.totalQty -= delta
            orderCount++
          }

          
        }
        
        user.usdBalance += user.lockedBalance
        user.lockedBalance = 0

        return {filledQty, priceAggregate }              
      }
    }
    
}
