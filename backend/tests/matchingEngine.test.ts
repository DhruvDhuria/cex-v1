import { matchEngine, BALANCES, ORDERBOOKS } from "../utils/machingEngine";
import {test, expect} from "vitest"



test("check if market bid order is working correctly", () => {
    BALANCES.push(
      {
        userId: "user_1",
        usdBalance: 50000,
        lockedBalance: 0, // USD locked in open BTC buy order(s)
        lockedAsset: { SOL: 0, BTC: 0 },
        BTC: 0.5,
        SOL: 100,
      },
      {
        userId: "user_2",
        usdBalance: 20000,
        lockedBalance: 0,
        lockedAsset: { SOL: 0, BTC: 0.1 }, // 0.1 BTC locked in an open sell order
        BTC: 1.2,
        SOL: 0,
      },
      {
        userId: "user_3",
        usdBalance: 8000,
        lockedBalance: 0, // USD locked in open SOL buy order
        lockedAsset: { SOL: 20, BTC: 0 }, // also has SOL locked in a separate sell
        BTC: 0,
        SOL: 300,
      },
    );

    ORDERBOOKS.SOL?.asks.push(
        {
            price: 151,
            totalQty: 50,
            orders: [
            {
                userId: "user_3",
                qty: 50,
                filledQTy: 0,
                orderId: "slkerjeoi",
                createdAt: new Date("2026-08-04T09:04:00Z"),
            },
            ],
        },
        {
            price: 153,
            totalQty: 25,
            orders: [
            {
                userId: "user_2",
                qty: 25,
                filledQTy: 10,
                orderId: "lskdfjeoiasl",
                createdAt: new Date("2026-08-04T09:04:30Z"),
            },
            ]
        },
    )

    let result = matchEngine({type: "MARKET", side: "BUY", market: "SOL", qty: 10, userId: "user_1",})

    expect(result?.filledQty).toBe(10)
    expect(result?.priceAggregate).toEqual([{levelPrice: 151, matchedOrders: 10}])
    let user = BALANCES.find(u => u.userId === "user_1");
    expect(user?.SOL).toBe(110)
    expect(user?.usdBalance).toBe(48490)
    let seller = BALANCES.find(u => u.userId === "user_3");
    expect(seller?.SOL).toBe(290)
}) 
