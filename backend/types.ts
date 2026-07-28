import z from "zod"
import { OrderSide, OrderType } from "./generated/prisma/enums"

const SignupSigninSchema = z.object({
    username: z.string("username should be string").min(3),
    password: z.string("password should be string").min(8, "password should be atleast of 8 characters")
})

/*
        type:           "market" | "limit",
        price:          number | null,
        qty:            number,
        market_id:      string,
        side:           "buy" | "sell"
*/

const OrderSchema = z.object({
    type: z.enum(OrderType),
    price: z.number("price should be a number").optional(),
    qty: z.number("quantity should be a number"),
    marketId: z.enum(["SOL", "BTC"]),
    side: z.enum(OrderSide)
})

interface UserBalance {
  userId: string;
  usdBalance: number ;
  lockedBalance: number;
  BTC: number;
  SOL: number;
}

interface OrderbookOrders {
  userId: string;
  qty: number;
  filledQTy: number;
  orderId: number;
  createdAt: Date;
}
interface OrderBookOrdersSchema {
  price: number;
  totalQty: number;
  orders: OrderbookOrders[];
}

interface AssetOrderBook {
  lastTradedPrice?: number | 0;
  asks: OrderBookOrdersSchema[];
  bids: OrderBookOrdersSchema[];
}
export {
    SignupSigninSchema,
    OrderSchema,
    
}
export type {
    OrderBookOrdersSchema,
    OrderbookOrders,
    UserBalance,
    AssetOrderBook
}