import "./env.js";
import { TypeSafeClient } from "@typesafe-ai/sdk";

const apiKey = process.env.TYPESAFE_AI_API_KEY || process.env.TYPESAFE_API_KEY;

export const typeSafeClient = apiKey
  ? new TypeSafeClient({ apiKey })
  : null;

export const isTypeSafeAvailable = () => Boolean(typeSafeClient);
