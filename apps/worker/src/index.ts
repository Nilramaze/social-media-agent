console.log("[worker] starting up...");

process.on("SIGINT", () => {
  console.log("[worker] shutting down");
  process.exit(0);
});

setInterval(() => {
  console.log("[worker] alive");
}, 30_000);
