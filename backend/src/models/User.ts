import express from "express";

export interface User {
  id: string;
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  createdAt: Date;
  lastLogin: Date;
}

export interface AuthenticatedRequest extends express.Request {
  user?: User;
}
