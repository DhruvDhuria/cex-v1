import type { Request, NextFunction, Response } from "express";
import jwt from "jsonwebtoken";

interface DecodedToken {
  userId: string;
}

export const AuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = req.headers["token"];

  if (!token || Array.isArray(token)) {
    res.status(401).json({
      message: "Unauthorized",
    });
    return;
  }

  try {
    const decodedToken = jwt.verify(
      token,
      process.env.JWT_SECRET!,
    ) as DecodedToken;
    const userId = decodedToken.userId;

    if (userId) {
      req.userId = userId;
      next();
    } else {
      res.status(403).json({ message: "Token was incorrect" });
    }
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};
