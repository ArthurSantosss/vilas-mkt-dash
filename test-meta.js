import process from 'node:process';

const token = process.env.META_ACCESS_TOKEN || process.env.VITE_META_ACCESS_TOKEN;

if (!token) {
  throw new Error('Set META_ACCESS_TOKEN before running this script.');
}

async function run() {
  const url = `https://graph.facebook.com/v22.0/me/adaccounts?fields=id,name,balance,amount_spent,spend_cap,is_prepay_account,funding_source_details&access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(JSON.stringify(data.data, null, 2));
}
run();
