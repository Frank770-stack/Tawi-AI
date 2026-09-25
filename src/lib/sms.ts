export interface SmsSender {
  send(to: string, message: string): Promise<void>;
}

/** Dev mode: prints the SMS to the server console instead of sending it. */
class ConsoleSmsSender implements SmsSender {
  async send(to: string, message: string) {
    console.log(`\n[SMS to ${to}] ${message}\n`);
  }
}

class AfricasTalkingSmsSender implements SmsSender {
  constructor(
    private username: string,
    private apiKey: string,
    private senderId?: string,
  ) {}

  async send(to: string, message: string) {
    const host =
      this.username === "sandbox"
        ? "https://api.sandbox.africastalking.com"
        : "https://api.africastalking.com";

    const body = new URLSearchParams({ username: this.username, to, message });
    if (this.senderId) body.set("from", this.senderId);

    const res = await fetch(`${host}/version1/messaging`, {
      method: "POST",
      headers: {
        apiKey: this.apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`Africa's Talking SMS failed: ${res.status} ${await res.text()}`);
    }
  }
}

export function getSmsSender(): SmsSender {
  if (process.env.SMS_MODE === "africastalking") {
    const username = process.env.AFRICASTALKING_USERNAME;
    const apiKey = process.env.AFRICASTALKING_API_KEY;
    if (!username || !apiKey) {
      throw new Error("AFRICASTALKING_USERNAME and AFRICASTALKING_API_KEY must be set");
    }
    return new AfricasTalkingSmsSender(
      username,
      apiKey,
      process.env.AFRICASTALKING_SENDER_ID || undefined,
    );
  }
  return new ConsoleSmsSender();
}
