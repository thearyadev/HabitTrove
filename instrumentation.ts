import { init } from '@/lib/env.server'; // startup env var check

// Ensure this function is exported
export async function register() {
  // We only want to run this code on the server side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    init();
  }
}
