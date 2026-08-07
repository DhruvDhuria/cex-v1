import type { AssetOrderBook, UserBalance } from "../types";
import { OrderType, OrderSide } from "../generated/prisma/enums";


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


type Returntype = {
  filledQty?: number,
  priceAggregate?: { levelPrice: number; matchedOrders: number, orderId?: string, matchedUser: string }[],
  error?: string,
  message?: string
}
// things i will need in the matching engine? order side
export function matchEngine({
  type,
  side,
  qty,
  market,
  price,
  userId,
}: {
  type: OrderType;
  side: OrderSide;
  qty: number;
  market: "SOL" | "BTC";
  price?: number;
  userId: string;
}): Returntype {
  ORDERBOOKS[market]!.asks.sort((a, b) => a.price - b.price);
  ORDERBOOKS[market]!.bids.sort((a, b) => b.price - a.price);

  let filledQty = 0;
  const user = BALANCES.find((u) => u.userId === userId);
  if (!user) {
    return { error: "User not found" };
  }
  const asset = ORDERBOOKS[market]!;
  if (type === "MARKET") {
    // how will we check the balance

    if (side === "BUY") {
      if (!asset.asks[0]) {
        return { error: "No asks price at this time" };
      }
      const marketPrice = asset.lastTradedPrice
        ? asset.lastTradedPrice
        : asset.asks[0].price;

      if (!marketPrice) {
        return { error: "trading has not started yet in the market segment" };
      }

      const estimatedPrice = marketPrice * qty;
      const bufferPrice = estimatedPrice * 0.03;

      if (user.usdBalance < estimatedPrice + bufferPrice) {
        return { error: "Insufficient balance" };
      }

      user.usdBalance -= estimatedPrice + bufferPrice;
      user.lockedBalance += estimatedPrice + bufferPrice;

      let count = 0;
      let orderCount = 0;
      let delta;

      const priceAggregate = [];

      while (qty !== filledQty) {
        delta = qty - filledQty;

        if (asset.asks[count]!.totalQty === 0) {
          count++;
          if (!asset.asks[count]) {
            if (delta) {
              user.usdBalance += user.lockedBalance;
              user.lockedBalance = 0;
              return { filledQty, priceAggregate };
            }
          }
          orderCount = 0;
        }

        let availableAsk = asset.asks[count]!.orders[orderCount]!;
        let sellerId = availableAsk.userId;
        const seller = BALANCES.find((u) => u.userId === sellerId);

        if (!seller) {
          user.usdBalance += user.lockedBalance;
          user.lockedBalance = 0;
          return { filledQty, priceAggregate, error: "Seller not found" };
        }

        if(seller.userId === user.userId) {
          orderCount++;
          continue;
        }

        const matchedOrders = Math.min(availableAsk.qty, delta);
        const levelPrice = asset.asks[count]?.price!;

        const deductableAmt = levelPrice * matchedOrders;
        if (availableAsk.qty <= delta) {
          user.lockedBalance -= deductableAmt;
          user[market] += availableAsk.qty;
          filledQty += availableAsk.qty;
          seller.usdBalance += deductableAmt;
          seller.lockedAsset[market] -= availableAsk.qty;
          priceAggregate.push({ levelPrice, matchedOrders, orderId: availableAsk.orderId, matchedUser: seller.userId });
          asset.asks[count]!.totalQty -= availableAsk.qty;
          availableAsk.qty = 0;

          asset.asks[count]?.orders.splice(orderCount, 1);
        } else if (availableAsk.qty > delta) {
          user.lockedBalance -= deductableAmt;

          user[market] += delta;
          filledQty += delta;

          seller.usdBalance += deductableAmt;
          availableAsk.qty -= delta;
          seller.lockedAsset[market] -= delta;
          priceAggregate.push({ levelPrice, matchedOrders, orderId: availableAsk.orderId, matchedUser: seller.userId });

          asset.asks[count]!.totalQty -= delta;
          orderCount++;
        }
      }

      user.usdBalance += user.lockedBalance;
      user.lockedBalance = 0;

      return { filledQty, priceAggregate };
    } else {
      if (!asset.bids[0]) {
        return { error: "No bids at this time" };
      }

      if (user[market] < qty) {
        return { error: "insufficient Balance" };
      }

      user[market] -= qty;
      user.lockedAsset[market] += qty;

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

        let availableBid = asset.bids[count]!.orders[orderCount]!;
        let buyerId = availableBid.userId;
        const buyer = BALANCES.find((u) => u.userId === buyerId);

        if (!buyer) {
          user[market] += user.lockedAsset[market];
          user.lockedAsset[market] = 0;
          return { filledQty, priceAggregate, error: "Buyer not found" };
        }

        if(buyer.userId === user.userId) {
          orderCount++;
          continue;
        }
        const matchedOrders = Math.min(availableBid.qty, delta);
        const levelPrice = asset.bids[count]!.price;

        const tradeAmount = levelPrice * matchedOrders;
        if (availableBid.qty <= delta) {
          buyer.lockedBalance -= tradeAmount;
          buyer[market] += availableBid.qty;
          filledQty += availableBid.qty;
          user.lockedAsset[market] -= availableBid.qty;
          user.usdBalance += tradeAmount;
          priceAggregate.push({ levelPrice, matchedOrders, orderId: availableBid.orderId, matchedUser: buyer.userId });
          asset.bids[count]!.totalQty -= availableBid.qty;
          availableBid.qty = 0;

          asset.bids[count]!.orders.splice(orderCount, 1);
        } else if (availableBid.qty > delta) {
          buyer.lockedBalance -= tradeAmount;

          buyer[market] += delta;
          filledQty += delta;

          user.usdBalance += tradeAmount;
          availableBid.qty -= delta;
          user.lockedAsset[market] -= delta;
          priceAggregate.push({ levelPrice, matchedOrders, orderId: availableBid.orderId, matchedUser: buyer.userId });

          asset.bids[count]!.totalQty -= delta;
          orderCount++;
        }
      }

      user[market] += user.lockedAsset[market];
      user.lockedAsset[market] = 0;

      return { filledQty, priceAggregate };
    }
  }else if (type === "LIMIT") {
    if (!price) {
      return { error: "Price is required for limit orders" };
    }
    const priceAggregate: { levelPrice: number; matchedOrders: number, orderId: string, matchedUser: string }[] = [];
    if (side === "BUY") {
      const totalCost = price * qty;
      if (user.usdBalance < totalCost) {
        return { error: "Insufficient balance" };
      }

      user.usdBalance -= totalCost;
      user.lockedBalance += totalCost;

      asset.asks.sort((a, b) => a.price - b.price);
      for(let askIndex = 0; askIndex < asset.asks.length && filledQty < qty; askIndex++) {
        const ask = asset.asks[askIndex]!;
        if(price < ask.price)  break;
       
        if (filledQty === qty) {
          return { filledQty, priceAggregate };
        }

        for (let i = 0; i < ask.orders.length && filledQty < qty; i++) {
          const askPrice = ask.price;
          const availableAsk = ask.orders[i]!;
          if(availableAsk.qty === 0) {
            ask.orders.splice(i, 1);
            i--;
            continue;
          }
          const sellerId = availableAsk.userId;
          const seller = BALANCES.find((u) => u.userId === sellerId);
          const delta = qty - filledQty;
          if (!seller) {
            user.usdBalance += user.lockedBalance;
            user.lockedBalance = 0;
            return { filledQty, priceAggregate, error: "Seller not found" };
          }
          if(seller.userId === user.userId) {
            continue;
          }
          if (filledQty === qty) {

            return { filledQty, priceAggregate };
          }

          if (availableAsk.qty <= delta) {
            const deductableAmt = askPrice * availableAsk.qty;
            user.lockedBalance -= deductableAmt;
            user[market] += availableAsk.qty;
            filledQty += availableAsk.qty;
            seller.usdBalance += deductableAmt;
            seller.lockedAsset[market] -= availableAsk.qty;
            user.usdBalance += (price - askPrice) * availableAsk.qty;
            user.lockedBalance -= (price - askPrice) * availableAsk.qty;
            priceAggregate.push({
              levelPrice: askPrice,
              matchedOrders: availableAsk.qty,
              orderId: availableAsk.orderId,
              matchedUser: seller.userId,
            });
            ask.totalQty -= availableAsk.qty;
            availableAsk.qty = 0;

            ask.orders.splice(i, 1);
            i--;
          } else if (availableAsk.qty > delta) {
            const deductableAmt = askPrice * delta;
            user.lockedBalance -= deductableAmt;
            user[market] += delta;
            filledQty += delta;
            seller.usdBalance += deductableAmt;
            availableAsk.qty -= delta;
            seller.lockedAsset[market] -= delta;
            user.usdBalance += (price - askPrice) * delta;
            user.lockedBalance -= (price - askPrice) * delta;
            ask.totalQty -= delta;
            priceAggregate.push({
              levelPrice: askPrice,
              matchedOrders: delta,
              orderId: availableAsk.orderId,
              matchedUser: seller.userId,
            });
          }
        }
               
      };
      if (filledQty !== qty) {
        const remainingQty = qty - filledQty;
        asset.bids.push({
          price: price,
          totalQty: remainingQty,
          orders: [
            {
              userId: user.userId,
              qty: remainingQty,
              filledQTy: 0,
              orderId: crypto.randomUUID(),
              createdAt: new Date(),
            },
          ],
        });
        return {filledQty, priceAggregate, message: "Order added to order book" };
      
      }
      user.usdBalance += user.lockedBalance;
      user.lockedBalance = 0;
      return { filledQty, priceAggregate };
    } else {
      if (user[market] < qty) {
        return { error: "Insufficient balance" };
      }

      user[market] -= qty;
      user.lockedAsset[market] += qty;

      asset.bids.sort((a, b) => b.price - a.price);

      for (
        let bidIndex = 0;
        bidIndex < asset.bids.length && filledQty < qty;
        bidIndex++
      ) {
        const bid = asset.bids[bidIndex]!;
        if(bid.totalQty === 0) {
          asset.bids.splice(bidIndex, 1);
          bidIndex--;
          continue;
        }

        if(price > bid.price) {
          break;
        }
        
        for (let i = 0; i < bid.orders.length && filledQty < qty; i++) {
          const bidPrice = bid.price;
          const availableBid = bid.orders[i]!;
          const buyerId = availableBid.userId;
          const buyer = BALANCES.find((u) => u.userId === buyerId);
          const delta = qty - filledQty;

          if (!buyer) {
            user[market] += user.lockedAsset[market];
            user.lockedAsset[market] = 0;
            return { filledQty, error: "Buyer not found" };
          }
          if(buyer.userId === user.userId) {
            continue;
          }

          const matchedOrders = Math.min(availableBid.qty, delta);
          const tradeAmount = bidPrice * matchedOrders;

          if (availableBid.qty <= delta) {
            buyer.lockedBalance -= tradeAmount;
            buyer[market] += availableBid.qty;
            filledQty += availableBid.qty;
            user.usdBalance += tradeAmount;
            user.lockedAsset[market] -= availableBid.qty;
            priceAggregate.push({
              levelPrice: bidPrice,
              matchedOrders: availableBid.qty,
              orderId: availableBid.orderId,
              matchedUser: buyer.userId,
            });
            bid.totalQty -= availableBid.qty;
            availableBid.qty = 0;

            bid.orders.splice(i, 1);
            i--;
          } else {
            buyer.lockedBalance -= tradeAmount;
            buyer[market] += delta;
            filledQty += delta;
            user.usdBalance += tradeAmount;
            availableBid.qty -= delta;
            user.lockedAsset[market] -= delta;
            bid.totalQty -= delta;
            priceAggregate.push({
              levelPrice: bidPrice,
              matchedOrders: delta,
              matchedUser: buyer.userId,
              orderId: availableBid.orderId,
            });

          }
        }
        
      }

      if (filledQty !== qty) {
        const remainingQty = qty - filledQty;
        asset.asks.push({
          price: price,
          totalQty: remainingQty,
          orders: [
            {
              userId: user.userId,
              qty: remainingQty,
              filledQTy: 0,
              orderId: crypto.randomUUID(),
              createdAt: new Date(),
            },
          ],
        });
        return {filledQty, priceAggregate, message: "Order added to order book" };
        
      }

      user[market] += user.lockedAsset[market];
      user.lockedAsset[market] = 0;

      return { filledQty, priceAggregate };
    }
  }

  return { error: "Invalid order type" };
}


export function deleteOrderFromOrderBook(order: { orderId: string; market: string; side: OrderSide }) {
  const { orderId, market, side } = order;
  const asset = ORDERBOOKS[market]!;

  const orderSide = side === "BUY" ? asset.bids : asset.asks;
  
  for (let i = 0; i < orderSide.length; i++) {
    const level = orderSide[i]!;
    const orderIndex = level.orders.findIndex((o) => o.orderId === orderId);
    if (orderIndex !== -1) {
      level.orders.splice(orderIndex, 1);
      if (level.orders.length === 0) {
        orderSide.splice(i, 1);
      }
      break;
    }
  }
}


export function getDepth(market: string) {
  const asset = ORDERBOOKS[market]!;
  const asks = asset.asks.map((ask) => ({
    price: ask.price,
    totalQty: ask.totalQty,
  }));
  const bids = asset.bids.map((bid) => ({
    price: bid.price,
    totalQty: bid.totalQty,
  }));
  return { asks, bids };
}


export function getUserBalance(userId: string) {
  const user = BALANCES.find((u) => u.userId === userId);

  if(!user) {
    return { error: "User not found" };
  }

  return{ user}

}