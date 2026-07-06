#!/usr/bin/env bun

const [, , command] = Bun.argv;

switch (command) {
  case "doctor":
  case "rules":
  case "verify":
  case "init":
    console.log(`cdh ${command} is not implemented yet; current milestone is WP0.`);
    break;
  case undefined:
  case "--help":
  case "-h":
    console.log("Usage: cdh <init|doctor|rules|verify>");
    break;
  default:
    console.error(`Unknown command: ${command}`);
    process.exitCode = 1;
}
