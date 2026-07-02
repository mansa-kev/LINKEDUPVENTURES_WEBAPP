const targetUrl = 'https://edroffvtzrowpsooszqh.supabase.co/storage/v1/object/public/public_assets/e_contracts/signed-contract-891e8266-ac00-40a7-acee-96078439bc06-1783006807261.pdf';
async function test() {
  const response = await fetch(targetUrl);
  console.log('Status:', response.status);
  console.log('Content-Type:', response.headers.get('content-type'));
  const buffer = await response.arrayBuffer();
  console.log('Buffer size:', buffer.byteLength);
}
test().catch(console.error);
