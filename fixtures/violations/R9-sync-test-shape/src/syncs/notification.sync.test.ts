import { notificationSync } from "./notification.sync.ts";

if (!notificationSync.then) throw new Error("missing sync field");
