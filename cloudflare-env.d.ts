declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AUVO_ENCRYPTION_KEY?: string;
    AUVO_WEBHOOK_SECRET?: string;
    ARTBEC_ADMIN_EMAILS?: string;
  }
}
