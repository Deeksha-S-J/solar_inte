import axios from "axios";

async function sendVoltageAlert() {
  try {

    const webhookUrl =
    "https://lttech.app.n8n.cloud/webhook/a1f75b6e-d0b5-41a2-ab3f-c76ccfb324a5";

    const payload = {
      faulty_row: "ROW1",
      avg_voltage: 10
    };

    const response = await axios.post(webhookUrl, payload);

    console.log("Webhook triggered successfully");
    console.log(response.data);

  } catch (error) {
    console.error("Error triggering webhook:", error.message);
  }
}

sendVoltageAlert();