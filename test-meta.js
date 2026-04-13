const token = 'EAAZAuTXAeZB3UBQ1xyMP5Hp8GRiBoZCxlXTVLaBLqI0EGDsEmsnLdHGbD6guoDYYZChKIBu3yKJVL0gqEuZBPay29u6RBOeiFjU8I8wMZCcbPzIlfpSVQbtl7d7v4ZCBb4YixCDwVyOhqYfVseb04CXVLNVNiHHQQlUAKe6PMFqd9x4vSC8kZA4iLqQ0O9oAzDbZC';

async function run() {
  const url = `https://graph.facebook.com/v22.0/me/adaccounts?fields=id,name,balance,amount_spent,spend_cap,is_prepay_account,funding_source_details&access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(JSON.stringify(data.data, null, 2));
}
run();
