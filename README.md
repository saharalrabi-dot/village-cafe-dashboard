# لوحة أداء «البقاء على قيد الحياة في مقهى القرية»

صفحة تعرض أداء اللعبة في روبلكس بلغة بسيطة، وتُحدَّث تلقائيًا كل يوم من تحليلات روبلكس الرسمية (Open Cloud Analytics).

**رابط اللوحة:** https://saharalrabi-dot.github.io/village-cafe-dashboard/

## كيف تعمل
- `scripts/fetch-analytics.mjs` يقرأ الأرقام من روبلكس (اللاعبون يوميًا، العودة في اليوم التالي وبعد أسبوع، دقائق اللعب، الزيارات، مصادر اللاعبين، الأرباح) ويحفظها في `data/analytics.json`.
- `.github/workflows/update.yml` يشغّله كل يوم الساعة 6:17 صباحًا بتوقيت الرياض، ويمكن تشغيله يدويًا من تبويب **Actions ← Update game analytics ← Run workflow**.
- `index.html` هي اللوحة نفسها، وتقرأ ملف البيانات.
- `data/events.json` أحداث تظهر على الرسوم بعلامة 📣 (حملات إعلانية، تحديثات للعبة). أضيفي سطرًا لكل حملة أو تحديث جديد.

## الإعداد (مرة واحدة)
1. **مفتاح روبلكس:** create.roblox.com ← Open Cloud ← API Keys ← Create API Key. في Access Permissions اختاري **universe-analytics**، وأضيفي اللعبة، وفعّلي **universe.analytics:read**. انسخي المفتاح.
2. **أضيفيه للمستودع:** Settings ← Secrets and variables ← Actions ← New repository secret. الاسم `ROBLOX_API_KEY` والقيمة المفتاح.
3. **فعّلي الصفحة:** Settings ← Pages ← Source: Deploy from a branch ← Branch: `main` / `(root)` ← Save.
4. **أول تحديث:** Actions ← Update game analytics ← Run workflow.

المفتاح يبقى سرًا داخل GitHub ولا يظهر في الصفحة. الصفحة نفسها عامة: من لديه الرابط يرى الأرقام.
