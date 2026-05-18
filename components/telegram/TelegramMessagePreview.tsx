import { Bot, UserRound } from "lucide-react";

export function TelegramMessagePreview() {
  const messages = [
    { from: "user", text: "Qaqa bugün 15 məhsul tap, 20 faizdən aşağı profit olmasın." },
    {
      from: "bot",
      text: "Oldu. Saved rules əsasında analiz edirəm. Riskli məhsullar list olunmayacaq."
    },
    { from: "bot", text: "Report: 15 analiz edildi, 6 uyğun gəldi, 5 draft yaradıldı." }
  ];

  return (
    <div className="rounded-lg border border-ink-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
      <h3 className="font-semibold text-ink-950 dark:text-white">Natural language control preview</h3>
      <div className="mt-4 space-y-3">
        {messages.map((message, index) => (
          <div key={`${message.from}-${index}`} className="flex gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-ink-100 text-ink-700 dark:bg-white/10 dark:text-ink-200">
              {message.from === "bot" ? <Bot size={16} /> : <UserRound size={16} />}
            </div>
            <p className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700 dark:bg-white/[0.06] dark:text-ink-200">
              {message.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
