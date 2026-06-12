import dotenv from "dotenv";

// .env.local takes precedence; dotenv does not override already-set vars,
// so load it first, then fall back to .env for anything unset.
dotenv.config({ path: ".env.local" });
dotenv.config();
