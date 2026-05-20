/**
 * Instrumentation Hook (Next.js 16)
 *
 * The backup scheduler is started from instrumentation.node.ts
 * which runs in the Node.js runtime. This file intentionally
 * remains a no-op to avoid webpack "Module not found" errors
 * that occur when instrumentation tries to statically import
 * Node.js modules.
 */

export async function register() {
  // No-op — scheduler is started from instrumentation.node.ts
}

export async function unregister() {
  // No-op — cleanup handled by instrumentation.node.ts
}
