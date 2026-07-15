import express from "express";
import {prisma} from "./db"
import { OrderSchema, SignupSigninSchema } from "./types";
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"

const BALANCES = {};

const ORDERBOOKS = {
  SOL: {},
  BTC: {},
};

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
app.post("/order", (req, res) => { });
/*
    returns the status of an order (partially filled, success, cancellled)
    ALSO RETURNS THE INDIVIDUAL FILLS OF THIS ORDER 
*/
app.get("/order/:orderId");
app.delete("/order/:orderId");
app.get("/depth/:symbol");
app.get("/orders");
app.get("/fills");

app.get("/balance/usd");

/*  
    Returns the balance of all stocks
*/
app.get("/balance");

app.listen(3000)