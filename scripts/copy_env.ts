#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "fs";
import path from "path";

const envPath = path.resolve(__dirname, "..", ".env.local");
const templatePath = path.resolve(__dirname, "..", ".env.example");

if (!fs.existsSync(templatePath)) {
  console.warn(
    ".env.example file does not exist, skipping copy of .env.local file",
  );
} else if (!fs.existsSync(envPath)) {
  fs.copyFileSync(templatePath, envPath);
}
