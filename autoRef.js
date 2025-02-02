import { saveToFile, delay, readFile } from "./utils/helper.js";
import log from "./utils/logger.js";
import Mailjs from "@cemalgnlts/mailjs";
import banner from "./utils/banner.js";
import fs from "fs";
import readline from "readline";

import { registerUser, createUserProfile, confirmUserReff, getUserRef } from "./utils/api.js";
const mailjs = new Mailjs();

async function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const main = async () => {
  log.info(banner);
  log.info(`proccesing run auto register (CTRL + C to exit)`);
  const tokens = await readFile("tokens.txt");
  const refCodes = await readFile("ref_codes.txt");
  let array = tokens;
  let answer = await askQuestion("Use ref code from 1/ref_codes.txt | 2/tokens.txt? | Lấy ref code từ file 1/ref_codes.txt 2/tokens.txt? (Chose: 1 - 2): ");
  answer = parseInt(answer);
  if (answer != 1 && answer != 2) {
    log.error("Invalid answer: 1 or 2, exiting...");
    process.exit(1);
  }
  if (answer == 1) {
    array = refCodes;
  }

  for (let i = 0; i < 5; i++) {
    for (const token of array) {
      let response = null,
        reffCode = null;

      if (answer == 2) {
        response = await getUserRef(token);
        if (!response?.data?.is_referral_active) continue;
        reffCode = response?.data?.referral_code;
      } else {
        reffCode = token;
      }

      if (reffCode) {
        log.info(`Found new active referral code:`, reffCode);
        try {
          let account = await mailjs.createOneAccount();
          while (!account?.data?.username) {
            log.warn("Failed To Generate New Email, Retrying...");
            await delay(3);
            account = await mailjs.createOneAccount();
          }

          const email = account.data.username;
          const password = account.data.password;

          log.info(`Trying to register email: ${email}`);
          let regResponse = await registerUser(email, password, null);
          let isRetries = false;
          while (!regResponse?.data?.token && !isRetries) {
            log.warn("Failed To Register, Retrying...");
            await delay(3);
            isRetries = true;
            regResponse = await registerUser(email, password, null);
          }

          if (!regResponse?.data?.token) {
            log.warn("Failed to register user: ", "Maximum number of referrals reached or Invalid reff code!");
            continue;
          }

          const token = regResponse.data.token;

          log.info(`Trying to create profile for ${email}`);
          await createUserProfile(token, { step: "username", username: email });
          await createUserProfile(token, { step: "description", description: "AI Startup" });

          let confirm = await confirmUserReff(token, reffCode);
          while (!confirm?.data?.token) {
            log.warn("Failed To Confirm Referral, Retrying...");
            await delay(3);
            confirm = await confirmUserReff(token, reffCode);
          }

          await saveToFile("accounts.txt", `${email}|${password}`);
          await saveToFile("tokens.txt", `${confirm.data.token}`);
        } catch (err) {
          log.error("Error creating account:", err.message);
        }
      } else {
        log.warn("No referral code found for this account");
      }
    }
  }
};

// Handle CTRL+C (SIGINT)
process.on("SIGINT", () => {
  log.warn("SIGINT received. Exiting...");
  process.exit();
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  log.error("Uncaught exception:", err);
  process.exit(1);
});

main();
