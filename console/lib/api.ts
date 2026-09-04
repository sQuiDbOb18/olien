// Where the Rust backend lives. Set NEXT_PUBLIC_BACKEND_URL in production.
export const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080";
