import express from "express";
import {prisma} from "./db"
import { OrderSchema, SignupSigninSchema} from "./types";
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { AuthMiddleware } from "./auth.middleware";
import { matchEngine, deleteOrderFromOrderBook, getDepth, getUserBalance } from "./utils/machingEngine";
import { OrderStatus } from "./generated/prisma/enums";




const app = express()


app.use(express.json())
app.use(express.urlencoded({extended: true}))



app.post("/signup", async(req, res) => {
    const {data, success, error} = SignupSigninSchema.safeParse(req.body)

    if(!success) {
        res.status(400).json({
            message: "Invalid inputs",
            error
        })
        console.log(error)
        return
    }
    const {username, password} = data

    try {
        const existingUser = await prisma.user.findFirst({
          where: {
            username,
          },
        });
        if (existingUser) {
          res.status(409).json({
            message: "User with this username already exists",
          });
          return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const createdUser = await prisma.user.create({
          data: {
            username,
            password: hashedPassword,
          },
        });

        if (!createdUser) {
          res.json({
            message: "User creation failed",
          });

          return;
        }

        const token = await jwt.sign(createdUser.id, process.env.JWT_SECRET!);

        res.status(201).json({
          message: "User created successfully",
          token,
        });
    
    } catch (error) {
        console.log(error);
        res.status(500).json({
          message: "Something went wrong while signing up the user",
        });
    }
});

app.post("/signin", async(req, res) => {
    const { data, success, error } = SignupSigninSchema.safeParse(req.body);

    if (!success) {
      res.status(400).json({
        message: "Invalid inputs",
        error,
      });
      console.log(error);
      return;
    }
    const { username, password } = data;

   try {
     const existingUser = await prisma.user.findFirst({
       where: {
         username,
         password,
       },
     });

     if (!existingUser) {
       res.status(404).json({
         message: "User not found",
       });
       return;
     }

     const token = await jwt.sign(existingUser.id, process.env.JWT_SECRET!);

     res.status(200).json({
       message: "User signed up successfully",
       token,
     });
   } catch (error) {
        console.log(error)
        res.status(500).json({
            message: "Something went wrong while signing in the user"
        })
   }
});

/*
    body = {
        type:           "market" | "limit",
        price:          number | null,
        qty:            number,
        market_id:      string,
        side:           "buy" | "sell"
    }

    @returns {
        orderId: string,
        filledQty: number,
        averagePrice
    }
*/

// 50.01

// 500001
app.post("/order",AuthMiddleware, async(req, res) => {
  const userId = req.userId!;
  const { data, success, error } = OrderSchema.safeParse(req.body);

  if (!success) {
    console.log(error);
    res.json({
      message: "Invalid Inputs",
      error,
    });
    return;
  }

  const { marketId, qty, side, type, price } = data;

  const order =  matchEngine({ market: marketId, qty, side, type, price, userId })!

  // from this we will get filled qty, average price, orderId, status of the order (partially filled, success, cancelled)
  if(order?.error){
    res.status(400).json({
      message: order.error
    })
    return
  }


  
  const orderStatus = order?.filledQty === qty ? OrderStatus.FILLED : OrderStatus.OPEN
  
  const createdOrder = await prisma.order.create({
    data: {quantity: qty, filledQuantity: order.filledQty!, side, market: marketId, status: orderStatus, type, userId}
  })
  

  await prisma.fill.createMany({
    data: order.priceAggregate!.map((fill) => {
      return {
        price: fill.levelPrice,
        quantity: fill.matchedOrders,
        orignalOrderId: createdOrder.id,
        userId,
        side,
        type: "TAKER",
        asset: marketId
      }
    })

  })
  await prisma.fill.createMany({
    data: order.priceAggregate!.map((fill) => {
      return {
        price: fill.levelPrice,
        quantity: fill.matchedOrders,
        orignalOrderId: createdOrder.id,
        userId: fill.matchedUser,
        side,
        type: "MAKER",
        asset: marketId
      }
    })

  })

  const averagePrice = order.priceAggregate!.reduce((acc, fill) => acc + fill.levelPrice * fill.matchedOrders, 0) / order.filledQty!

  res.json({
    orderId: createdOrder.id,
    filledQty: order.filledQty,
    averagePrice
  })


});
/*
    returns the status of an order (partially filled, success, cancellled)
    ALSO RETURNS THE INDIVIDUAL FILLS OF THIS ORDER 
*/
app.get("/order/:orderId", AuthMiddleware, async(req, res) => {
  const orderId = req.params.orderId as string;
  const userId = req.userId!

  if(!orderId){
    res.status(400).json({
      message: "OrderId is required"
    })
    return
  }
  const order = await prisma.order.findUnique({
    where: {
      id: orderId
    }
  })

  if(!order) {
    res.status(404).json({
      message: "Order not found"
    })
    return
  }

  if(order.userId !== userId){
    res.status(403).json({
      message: "You are not authorized to view this order"
    })
    return
  }

  const fills = await prisma.fill.findMany({
    where: {
      orignalOrderId: orderId
    }
  })
  if(!fills){
    res.status(404).json({
      message: "No fills found for this order"
    })
    return
  }

  res.json({
    order,
    fills
  })


});


app.delete("/order/:orderId",AuthMiddleware, async(req, res) => {
  const orderId = req.params.orderId as string;
  const userId = req.userId!;

  if(!orderId){
    res.status(400).json({
      message: "OrderId is required"
    })
    return
  }

  const order = await prisma.order.findUnique({
    where: {
      id: orderId
    }
  })
  if(!order){
    res.status(404).json({
      message: "Order not found"
    })
    return
  }

  if(order.userId !== req.userId){
    res.status(403).json({
      message: "You are not authorized to cancel this order"
    })
    return
  }

  if(order.status === OrderStatus.FILLED || order.status === OrderStatus.CANCELLED){
    res.status(400).json({
      message: "Order is already filled or cancelled"
    })
    return
  }


  deleteOrderFromOrderBook({ orderId, market: order.market, side: order.side })

  await prisma.order.update({
    where: {
      id: orderId
    },
    data: {
      status: OrderStatus.CANCELLED
    }
  });

  res.status(200).json({
    message: "Order cancelled successfully"
  })

});
app.get("/depth/:symbol", async(req, res) => {
  const symbol = req.params.symbol as string;

  if(!symbol) {
    res.status(400).json({
      message: "Symbol is required"
    })
    return
  }
  const depth = getDepth(symbol)

  res.status(200).json({
    depth
  })
});
app.get("/orders", AuthMiddleware, async(req, res) => {
  const userId = req.userId!;
  const orders = await prisma.order.findMany({
    where: {
      userId
    }
  })
  if(!orders){
    res.status(404).json({
      message: "No orders found"
    })
    return
  }

  res.status(200).json({
    orders
  })
});
app.get("/fills", AuthMiddleware, async(req, res) => {
  const userId = req.userId!;
  const fills = await prisma.fill.findMany({
    where: {
      userId
    }
  })

  if(!fills) {
    res.status(404).json({
      message: "No fills found"
    })
    return
  }

  res.status(200).json({
    fills
  })
});

app.get("/balance/usd", AuthMiddleware, async(req, res) => {
  const userId = req.userId!;
  const user = await prisma.user.findUnique({
    where: {
      id: userId
    }
  })


  const balance = getUserBalance(userId);

  if (balance.error || !user) {
     res.status(404).json({
       message: balance.error,
     });
     return;
  }


  res.status(200).json({
    usdBalance: balance.user?.usdBalance,
    lockedUsdBalance: balance.user?.lockedBalance
  })
});

/*  
    Returns the balance of all stocks
*/
app.get("/balance", AuthMiddleware, async(req, res) => {
  const userId = req.userId!;
  const user = await prisma.user.findUnique({
    where: {
      id: userId
    }
  })
  // if(!user){
  //   res.status(404).json({
  //     message: "User not found"
  //   })
  //   return
  // }
  const balance = getUserBalance(userId)

  if(balance.error || !user) { 
    res.status(404).json({
    message: balance.error
    }) 
  }

  
  res.status(200).json({
    stocks: {
      SOL: balance.user?.SOL,
      BTC: balance.user?.BTC,
      lockedAsset: balance.user?.lockedAsset
    }
  })
});

app.listen(3000)