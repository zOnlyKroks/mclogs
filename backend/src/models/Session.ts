import express from "express";

export interface Session {
  id: string;
  fingerprint: string; // Browser fingerprint for tracking
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  lastUsed: Date;
  expiresAt: Date;
  claimedBy?: string; // User ID if session was claimed
}


export interface SessionData {
  sessionId: string;
  fingerprint: string;
  isAuthenticated: boolean;
  user?: import('./User').User;
}