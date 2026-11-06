export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { AgentConfigurationError, validateProviderConfiguration } = await import("./lib/module3/gemini-config");
    try {
      validateProviderConfiguration();
    } catch (error) {
      console.error("[provider-config]", error instanceof AgentConfigurationError
        ? error.message : "Invalid provider configuration; check the embedding contract.");
      // This Next.js version keeps listening after a rejected instrumentation hook.
      // Exit explicitly so a misconfigured instance cannot appear healthy.
      process.exit(1);
    }
  }
}
