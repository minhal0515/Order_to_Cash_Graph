require("dotenv").config();
const fs = require("fs");
const readline = require("readline");
const pool = require("./db");
const path = require("path");

async function seedCustomers() {
  const folderPath = "../sap-o2c-data/business_partners";

  const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl"));

  for (const file of files) {
    const filePath = path.join(folderPath, file);

    const fileStream = fs.createReadStream(filePath);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      const data = JSON.parse(line);

      const id = data.businessPartner;
      const name = data.businessPartnerFullName;
      const createdAt = data.creationDate;
      const isBlocked = data.businessPartnerIsBlocked;

      try {
        await pool.query(
          `INSERT INTO customers (id, name, created_at, is_blocked)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [id, name, createdAt, isBlocked]
        );
      } catch (err) {
        console.error("Insert error:", err);
      }
    }
  }

  console.log("Customers seeded");
}
async function seedSalesOrders() {
  const fileStream = fs.createReadStream("../sap-o2c-data/sales_order_headers/part-20251119-133429-440.jsonl");

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const data = JSON.parse(line);

    const id = data.salesOrder;
    const customerId = data.soldToParty;
    const createdAt = data.creationDate;
    const totalAmount = parseFloat(data.totalNetAmount);
    const currency = data.transactionCurrency;

    try {
      await pool.query(
        `INSERT INTO sales_orders (id, customer_id, created_at, total_amount, currency)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [id, customerId, createdAt, totalAmount, currency]
      );
    } catch (err) {
      console.error("Order insert error:", err);
    }
  }

  console.log("Sales orders seeded");
}
  async function seedSalesOrderItems() {
    const folderPath = "../sap-o2c-data/sales_order_items";
  
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl"));
  
    for (const file of files) {
      const filePath = path.join(folderPath, file);
  
      const fileStream = fs.createReadStream(filePath);
  
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });
  
      for await (const line of rl) {
        const data = JSON.parse(line);
  
        const id = `${data.salesOrder}_${data.salesOrderItem}`;
        const orderId = data.salesOrder;
        const productId = data.material;
        const quantity = parseInt(data.requestedQuantity);
        const amount = parseFloat(data.netAmount);
  
        try {
          await pool.query(
            `INSERT INTO sales_order_items (id, order_id, product_id, quantity, amount)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO NOTHING`,
            [id, orderId, productId, quantity, amount]
          );
        } catch (err) {
          console.error("Order item insert error:", err);
        }
      }
    }
  
    console.log("Sales order items seeded");
  }
  async function seedProducts() {
    const folderPath = "../sap-o2c-data/products";
  
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl"));
  
    for (const file of files) {
      const filePath = path.join(folderPath, file);
  
      const fileStream = fs.createReadStream(filePath);
  
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });
  
      for await (const line of rl) {
        const data = JSON.parse(line);
  
        const id = data.product;
        const name = data.productOldId;
        const createdAt = data.creationDate;
        const isDeleted = data.isMarkedForDeletion;
  
        try {
          await pool.query(
            `INSERT INTO products (id, name, created_at, is_deleted)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO NOTHING`,
            [id, name, createdAt, isDeleted]
          );
        } catch (err) {
          console.error("Product insert error:", err);
        }
      }
    }
  
    console.log("Products seeded");
  }
  async function seedDeliveries() {
    const fileStream = fs.createReadStream("../sap-o2c-data/outbound_delivery_items/part-20251119-133431-439.jsonl");
  
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });
  
    const seen = new Set(); // avoid duplicate deliveries
  
    for await (const line of rl) {
      const data = JSON.parse(line);
  
      const id = data.deliveryDocument;
      const orderId = data.referenceSdDocument;
  
      if (seen.has(id)) continue;
      seen.add(id);
  
      try {
        await pool.query(
          `INSERT INTO deliveries (id, order_id)
           VALUES ($1, $2)
           ON CONFLICT (id) DO NOTHING`,
          [id, orderId]
        );
      } catch (err) {
        console.error("Delivery insert error:", err);
      }
    }
  
    console.log("Deliveries seeded");
  }
  async function seedDeliveryHeaders() {
    const folderPath = "../sap-o2c-data/outbound_delivery_headers";
  
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl"));
  
    for (const file of files) {
      const filePath = path.join(folderPath, file);
  
      const fileStream = fs.createReadStream(filePath);
  
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });
  
      for await (const line of rl) {
        const data = JSON.parse(line);
  
        const id = data.deliveryDocument;
        const createdAt = data.creationDate;
        const status = data.overallGoodsMovementStatus;
        const shippingPoint = data.shippingPoint;
  
        try {
          await pool.query(
            `UPDATE deliveries
             SET created_at = $1,
                 status = $2,
                 shipping_point = $3
             WHERE id = $4`,
            [createdAt, status, shippingPoint, id]
          );
        } catch (err) {
          console.error("Delivery header update error:", err);
        }
      }
    }
  
    console.log("All delivery headers processed");
  }
  async function seedInvoicesFromItems() {
    const folderPath = "../sap-o2c-data/billing_document_items";
  
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl"));
  
    const seen = new Set();
  
    for (const file of files) {
      const filePath = path.join(folderPath, file);
  
      const fileStream = fs.createReadStream(filePath);
  
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });
  
      for await (const line of rl) {
        const data = JSON.parse(line);
  
        const id = data.billingDocument;
        const deliveryId = data.referenceSdDocument;
  
        if (seen.has(id)) continue;
        seen.add(id);
  
        try {
          await pool.query(
            `INSERT INTO invoices (id, delivery_id)
             VALUES ($1, $2)
             ON CONFLICT (id) DO NOTHING`,
            [id, deliveryId]
          );
        } catch (err) {
          console.error("Invoice insert error:", err);
        }
      }
    }
  
    console.log("Invoices (items) seeded");
  }
  async function seedInvoiceHeaders() {
    const folderPath = "../sap-o2c-data/billing_document_headers";
  
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".jsonl"));
  
    for (const file of files) {
      const filePath = path.join(folderPath, file);
  
      const fileStream = fs.createReadStream(filePath);
  
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });
  
      for await (const line of rl) {
        const data = JSON.parse(line);
  
        const id = data.billingDocument;
        const customerId = data.soldToParty;
        const createdAt = data.creationDate;
        const totalAmount = parseFloat(data.totalNetAmount);
        const currency = data.transactionCurrency;
        const isCancelled = data.billingDocumentIsCancelled;
  
        try {
          await pool.query(
            `UPDATE invoices
             SET customer_id = $1,
                 created_at = $2,
                 total_amount = $3,
                 currency = $4,
                 is_cancelled = $5
             WHERE id = $6`,
            [customerId, createdAt, totalAmount, currency, isCancelled, id]
          );
        } catch (err) {
          console.error("Invoice update error:", err);
        }
      }
    }
  
    console.log("Invoice headers updated");
  }  async function run() {
    await seedCustomers();
    await seedProducts();
    await seedSalesOrders();
    await seedSalesOrderItems();
    await seedDeliveries();
    await seedDeliveryHeaders();
    await seedInvoicesFromItems();   
    await seedInvoiceHeaders();      
  }
  
  run();