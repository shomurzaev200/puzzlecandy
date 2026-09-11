import type { I18nMap, Lang } from "./types";

export const STRINGS: Record<string, Record<Lang, string>> = {
  lang_ru: { ru: "Русский", uz: "Ruscha", en: "Russian" },
  lang_uz: { ru: "O'zbekcha", uz: "O'zbekcha", en: "Uzbek" },
  lang_en: { ru: "English", uz: "Inglizcha", en: "English" },
  choose_language: {
    ru: "Добро пожаловать.\nВыберите язык:",
    uz: "Xush kelibsiz.\nTilni tanlang:",
    en: "Welcome.\nChoose your language:",
  },
  welcome: {
    ru: "Добро пожаловать в магазин\n«Премиальных» товаров PUZZLECANDY! 🍬\nРады снова вас видеть, уважаемый клиент.\n\nИЩЕТЕ РАБОТУ?\nКликайте на кнопку «РАБОТА 💵»\n\nНУЖНА ПОМОЩЬ?\nИспользуйте кнопку «ПОМОЩЬ»\n\nВсего сделок: {deals}\nТвой баланс: {balance}\nПокупок: {purchases}\nПерсональная скидка: {discount}%\n\nАссортимент наших товаров\nвы можете посмотреть ниже 👇",
    uz: "PUZZLECANDY premium do'koniga xush kelibsiz! 🍬\nSizni yana ko'rganimizdan xursandmiz.\n\nISH QIDIRYAPSIZMI? «ISH 💵» tugmasini bosing.\nYORDAM KERAKMI? «YORDAM» tugmasi.\n\nJami savdolar: {deals}\nBalansingiz: {balance}\nXaridlar: {purchases}\nShaxsiy chegirma: {discount}%\n\nMahsulotlar katalogini pastda ko'ring 👇",
    en: "Welcome to the PUZZLECANDY premium shop! 🍬\nGood to see you again.\n\nLOOKING FOR WORK? Tap JOBS 💵.\nNEED HELP? Tap HELP.\n\nTotal deals: {deals}\nYour balance: {balance}\nPurchases: {purchases}\nPersonal discount: {discount}%\n\nBrowse the assortment below 👇",
  },
  btn_catalog: { ru: "💎 ВИТРИНА ТОВАРОВ", uz: "💎 VITRINA", en: "💎 SHOWCASE" },
  btn_deposit: { ru: "💵 ПОПОЛНЕНИЕ БАЛАНСА", uz: "💵 BALANSNI TO'LDIRISH", en: "💵 TOP UP BALANCE" },
  btn_jobs: { ru: "💼 ИЩУ РАБОТУ", uz: "💼 ISH QIDIRAMAN", en: "💼 FIND A JOB" },
  btn_reviews: { ru: "⭐ ОТЗЫВЫ", uz: "⭐ SHARHLAR", en: "⭐ REVIEWS" },
  btn_rules: { ru: "📖 ПРАВИЛА", uz: "📖 QOIDALAR", en: "📖 RULES" },
  btn_info: { ru: "ℹ️ ИНФО", uz: "ℹ️ MA'LUMOT", en: "ℹ️ INFO" },
  btn_orders: { ru: "🛒 МОИ ЗАКАЗЫ", uz: "🛒 BUYURTMALARIM", en: "🛒 MY ORDERS" },
  btn_help: { ru: "❗ ПОМОЩЬ / 🥷 ОПЕРАТОР", uz: "❗ YORDAM / OPERATOR", en: "❗ HELP / OPERATOR" },
  btn_lang: { ru: "🇷🇺 ИЗМЕНИТЬ ЯЗЫК", uz: "🇺🇿 TILNI O'ZGARTIRISH", en: "🇬🇧 CHANGE LANGUAGE" },
  btn_exchange: { ru: "💱 ОБМЕННИК", uz: "💱 AYIRBOSHLASH", en: "💱 EXCHANGE" },
  btn_connect_bot: { ru: "🤖 ПОДКЛЮЧИТЬ СВОЕГО БОТА", uz: "🤖 BOTNI ULASH", en: "🤖 CONNECT YOUR BOT" },
  btn_back: { ru: "⬅️ НАЗАД", uz: "⬅️ ORQAGA", en: "⬅️ BACK" },
  btn_home: { ru: "🏠 ГЛАВНОЕ МЕНЮ", uz: "🏠 ASOSIY MENYU", en: "🏠 MAIN MENU" },
  btn_buy: { ru: "🛒 КУПИТЬ", uz: "🛒 SOTIB OLISH", en: "🛒 BUY" },
  btn_more: { ru: "ℹ️ ПОДРОБНЕЕ", uz: "ℹ️ BATAFSIL", en: "ℹ️ DETAILS" },
  btn_confirm: { ru: "✅ ПОДТВЕРДИТЬ", uz: "✅ TASDIQLASH", en: "✅ CONFIRM" },
  btn_cancel: { ru: "❌ ОТМЕНА", uz: "❌ BEKOR QILISH", en: "❌ CANCEL" },
  btn_topup: { ru: "💵 ПОПОЛНИТЬ БАЛАНС", uz: "💵 BALANSNI TO'LDIRISH", en: "💵 TOP UP" },
  catalog_title: { ru: "Витрина товаров", uz: "Mahsulotlar vitrinasi", en: "Product showcase" },
  catalog_empty: {
    ru: "Каталог пока пуст. Товары появятся после публикации администратором.",
    uz: "Katalog hozircha bo'sh.",
    en: "The catalog is empty until an admin publishes products.",
  },
  cat_new: { ru: "Новинки", uz: "Yangiliklar", en: "New" },
  cat_popular: { ru: "Популярное", uz: "Mashhur", en: "Popular" },
  cat_sale: { ru: "Со скидкой", uz: "Chegirmada", en: "On sale" },
  in_stock: { ru: "В наличии: {n}", uz: "Omborda: {n}", en: "In stock: {n}" },
  out_of_stock: { ru: "Нет в наличии", uz: "Ombarda yo'q", en: "Out of stock" },
  price: { ru: "Цена: {price}", uz: "Narx: {price}", en: "Price: {price}" },
  rating: { ru: "Рейтинг: {rating} ({count})", uz: "Reyting: {rating} ({count})", en: "Rating: {rating} ({count})" },
  insufficient: {
    ru: "Недостаточно средств.\n\nСтоимость: {price}\nТвой баланс: {balance}\nНе хватает: {need}",
    uz: "Mablag' yetarli emas.\n\nNarx: {price}\nBalans: {balance}\nYetishmaydi: {need}",
    en: "Insufficient funds.\n\nPrice: {price}\nYour balance: {balance}\nShort by: {need}",
  },
  confirm_purchase: {
    ru: "Подтвердить покупку?\n\n{name}\nК оплате: {price}\nБаланс после: {after}",
    uz: "Xaridni tasdiqlaysizmi?\n\n{name}\nTo'lov: {price}\nKeyingi balans: {after}",
    en: "Confirm purchase?\n\n{name}\nDue: {price}\nBalance after: {after}",
  },
  purchase_ok: {
    ru: "Заказ создан.\nНомер: {code}\nСписано: {price}\nОстаток: {balance}",
    uz: "Buyurtma yaratildi.\nRaqam: {code}\nYechildi: {price}\nQoldiq: {balance}",
    en: "Order created.\nNumber: {code}\nCharged: {price}\nRemaining: {balance}",
  },
  blocked: {
    ru: "Аккаунт заблокирован. Обратитесь к оператору.",
    uz: "Hisob bloklangan. Operatorga murojaat qiling.",
    en: "Account blocked. Contact the operator.",
  },
  deposit_pick: {
    ru: "Выберите сумму пополнения:",
    uz: "To'ldirish summasini tanlang:",
    en: "Choose a top-up amount:",
  },
  deposit_other: { ru: "Другая сумма", uz: "Boshqa summa", en: "Other amount" },
  deposit_enter: {
    ru: "Введите сумму в USD (минимум {min}, максимум {max}):",
    uz: "USD summasini kiriting (min {min}, max {max}):",
    en: "Enter an amount in USD (min {min}, max {max}):",
  },
  deposit_created: {
    ru: "Заявка на пополнение создана.\n\nСумма: {amount}\nНомер заявки: {code}\n\nОплатите указанную сумму через платёжный канал, затем отправьте скриншот оплаты.\n\nОтправьте фото квитанции прямо сюда.",
    uz: "To'ldirish arizasi yaratildi.\n\nSumma: {amount}\nAriza: {code}\n\nTo'lov cheki skrinshotini yuboring.",
    en: "Top-up request created.\n\nAmount: {amount}\nRequest: {code}\n\nPay via the payment channel, then send a screenshot of the receipt here.",
  },
  screenshot_ok: {
    ru: "Скриншот получен.\nПлатёж отправлен на проверку администратору.\nПосле проверки баланс будет зачислен автоматически.",
    uz: "Skrinshot qabul qilindi.\nTo'lov administrator tekshiruviga yuborildi.",
    en: "Screenshot received.\nThe payment was sent to an administrator for review.\nYour balance will be credited after approval.",
  },
  payment_approved: {
    ru: "Платёж подтверждён.\nСумма: +{amount}\nНовый баланс: {balance}",
    uz: "To'lov tasdiqlandi.\nSumma: +{amount}\nYangi balans: {balance}",
    en: "Payment approved.\nAmount: +{amount}\nNew balance: {balance}",
  },
  payment_rejected: {
    ru: "Платёж отклонён.\nОбратитесь к оператору.",
    uz: "To'lov rad etildi.\nOperatorga murojaat qiling.",
    en: "Payment rejected.\nPlease contact the operator.",
  },
  no_orders: { ru: "У вас пока нет заказов.", uz: "Hozircha buyurtmalar yo'q.", en: "You have no orders yet." },
  order_line: { ru: "{code} · {status} · {total}", uz: "{code} · {status} · {total}", en: "{code} · {status} · {total}" },
  reviews_empty: { ru: "Отзывов пока нет.", uz: "Sharhlari yo'q.", en: "No reviews yet." },
  review_prompt: {
    ru: "Оцените заказ {code} от 1 до 5 и напишите текст:",
    uz: "{code} buyurtmasini 1-5 baholang:",
    en: "Rate order {code} from 1 to 5 and add a comment:",
  },
  review_thanks: { ru: "Спасибо за отзыв!", uz: "Fikr-mulohaza uchun rahmat!", en: "Thanks for the review!" },
  support_prompt: {
    ru: "Опишите вопрос — оператор ответит здесь.",
    uz: "Savolingizni yozing — operator javob beradi.",
    en: "Describe your question — an operator will reply here.",
  },
  support_sent: {
    ru: "Обращение {code} создано. Ожидайте ответа оператора.",
    uz: "{code} murojaati yaratildi.",
    en: "Ticket {code} opened. Wait for an operator reply.",
  },
  jobs_empty: { ru: "Сейчас нет открытых вакансий.", uz: "Ochiq vakansiyalar yo'q.", en: "No open jobs right now." },
  job_apply: { ru: "ОТКЛИКНУТЬСЯ", uz: "ARIZA", en: "APPLY" },
  job_applied: { ru: "Заявка отправлена.", uz: "Ariza yuborildi.", en: "Application sent." },
  exchange_title: { ru: "Текущие курсы (к USD)", uz: "Joriy kurslar (USD ga)", en: "Current rates (to USD)" },
  connect_bot_prompt: {
    ru: "Отправьте токен вашего бота от @BotFather.\nТокен хранится в зашифрованном виде и не показывается другим пользователям.",
    uz: "@BotFather tokenini yuboring. Token boshqalarga ko'rinmaydi.",
    en: "Send your bot token from @BotFather.\nIt is stored securely and never shown to other users.",
  },
  connect_bot_ok: {
    ru: "Бот принят на проверку: @{username}",
    uz: "Bot tekshiruvga qabul qilindi: @{username}",
    en: "Bot submitted for verification: @{username}",
  },
  connect_bot_bad: {
    ru: "Не удалось проверить токен. Проверьте значение и попробуйте снова.",
    uz: "Tokenni tekshirib bo'lmadi.",
    en: "Could not verify that token. Check it and try again.",
  },
  unknown: {
    ru: "Не понял запрос. Используйте кнопки меню.",
    uz: "Tushunilmadi. Menyudagi tugmalardan foydalaning.",
    en: "I didn't catch that. Use the menu buttons.",
  },
  product_gone: { ru: "Товар недоступен.", uz: "Mahsulot mavjud emas.", en: "Product unavailable." },
  courier_welcome: {
    ru: "Курьерский контур PUZZLECANDY.\nПосле регистрации администратор подтвердит доступ.",
    uz: "PUZZLECANDY kuryer tizimi.",
    en: "PUZZLECANDY courier desk.\nAn admin will confirm access after registration.",
  },
  courier_online: { ru: "🟢 Я ОНЛАЙН", uz: "🟢 ONLAYNMAN", en: "🟢 I'M ONLINE" },
  courier_offline: { ru: "🔴 Я ОФФЛАЙН", uz: "🔴 OFLAYNMAN", en: "🔴 I'M OFFLINE" },
  courier_tasks: { ru: "📦 МОИ ЗАДАЧИ", uz: "📦 VAZIFALARIM", en: "📦 MY TASKS" },
  courier_loc: { ru: "📍 ОТПРАВИТЬ ЛОКАЦИЮ", uz: "📍 LOKATSIYA", en: "📍 SEND LOCATION" },
  courier_photo: { ru: "📷 ОТЧЁТ / ФОТО", uz: "📷 HISOBOT / FOTO", en: "📷 REPORT / PHOTO" },
  courier_profile: { ru: "ℹ️ ПРОФИЛЬ", uz: "ℹ️ PROFIL", en: "ℹ️ PROFILE" },
  courier_done: { ru: "✅ ЗАДАЧА ВЫПОЛНЕНА", uz: "✅ VAZIFA BAJARILDI", en: "✅ TASK COMPLETE" },
  courier_accept: { ru: "✅ ПРИНЯТЬ", uz: "✅ QABUL", en: "✅ ACCEPT" },
  courier_decline: { ru: "❌ ОТКАЗАТЬ", uz: "❌ RAD ETISH", en: "❌ DECLINE" },
  courier_accepted: { ru: "✅ Задача принята. Отправьте локацию и фото отчёта.", uz: "✅ Vazifa qabul qilindi.", en: "✅ Task accepted. Send location and a report photo." },
  courier_declined: { ru: "Задача отклонена.", uz: "Vazifa rad etildi.", en: "Task declined." },
  courier_new_task: {
    ru: "НОВАЯ ЗАДАЧА\nЗаказ: {order}\nТовар: {product}\nКоличество: {qty}\n{notes}",
    uz: "YANGI VAZIFA\nBuyurtma: {order}\nMahsulot: {product}\nSoni: {qty}\n{notes}",
    en: "NEW TASK\nOrder: {order}\nProduct: {product}\nQty: {qty}\n{notes}",
  },
  loc_saved: { ru: "Локация сохранена.", uz: "Lokatsiya saqlandi.", en: "Location saved." },
  photo_saved: { ru: "Фото отчёта сохранено.", uz: "Hisobot fotosi saqlandi.", en: "Report photo saved." },
  report_need: {
    ru: "Для закрытия задачи отправьте локацию, фото и комментарий.",
    uz: "Vazifani yopish uchun lokatsiya, foto va izoh yuboring.",
    en: "To complete the task send location, a photo and a comment.",
  },
  report_sent: {
    ru: "Отчёт отправлен на проверку администратору.",
    uz: "Hisobot administrator tekshiruviga yuborildi.",
    en: "Report submitted for admin review.",
  },
  payment_bot_hi: {
    ru: "Бот приёма платежей PUZZLECANDY.\nОтправьте номер заявки (PAY-…) и скриншот оплаты.",
    uz: "PUZZLECANDY to'lov boti. PAY- raqami va skrinshot yuboring.",
    en: "PUZZLECANDY payments desk.\nSend your request number (PAY-…) and a payment screenshot.",
  },
};

export function t(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  const pack = STRINGS[key];
  let s = pack?.[lang] ?? pack?.en ?? pack?.ru ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

export function pickI18n(map: I18nMap | string | null | undefined, lang: Lang): string {
  if (!map) return "";
  if (typeof map === "string") return map;
  return map[lang] || map.en || map.ru || map.uz || "";
}

export function langFromCode(code?: string | null): Lang {
  if (!code) return "ru";
  const c = code.toLowerCase();
  if (c.startsWith("uz")) return "uz";
  if (c.startsWith("en")) return "en";
  if (c.startsWith("ru")) return "ru";
  return "ru";
}
