---
name: russian-texts
description: Rules and a proofreading pass for user-facing Russian text in yartt. Use before writing or changing any Russian string: shared/i18n/ru.ts, shared/i18n/help/ru.ts (the guide), Russian demo texts in server/demoTexts.ts, email texts in the mail section, error messages.
---

# Russian texts in yartt

Russian is the reference language of the interface and the guide. It is read
by people who never see the code, the English decisions or db.sql. Write it as
an experienced Russian technical writer would: plain, exact, short.

## Write, do not translate

The English in `docs/product/decisions.md`, `db.sql` and code comments is a
source of facts, never of wording. Take the idea and write it from scratch in
Russian.

| Calque (wrong) | From | Russian (right) |
|---|---|---|
| ставит на его место то, что гнётся дальше | bends further | что предлагает взамен |
| описывает её в своих границах | within his bounds | сам описывает, что сделает |
| график против бюджета | against the budget | в сравнении с бюджетом |
| держать направление в бюджете | a direction | уложиться в бюджет |
| задача не расходится тихо | spread quietly | не расходится по рукам незаметно |
| показывают работу, а не усердие | work, not zeal | показывают сделанное, а не видимость занятости |
| смена лежит в одном дне | lies within a day | смена укладывается в один день |

## Dashes

- Never a comma before a dash: «Если нужно, — сделайте» is wrong.
- A dash only where grammar needs it, in a definition: «Бюджет — ориентир»,
  «Комментарий — текст с форматированием». Labels in diagrams may use one:
  «владелец — Марина».
- Never a dash in place of a word. Write «если», «чтобы», «когда», «указывается»:

| Wrong | Right |
|---|---|
| Нужен ответ — упомяните его | Если нужен ответ, упомяните его |
| Работы много — пусть заведёт свою задачу | Если работы много, пусть он заведёт свою задачу |
| Под каждым — от чего он отказывается | Под каждым указывается, от чего он отказывается |
| Все прошлые дни — в «Истории» | Все прошлые дни собраны в «Истории» |
| Причина — в подсказке | Причину объясняет подсказка |

## Words and grammar

- The interface's words only: владелец, участник, тег, дедлайн, «Ждёт меня».
  A button or tab is named exactly as on screen, in «ёлочках».
- An action names where it is done, then how: «упомяните его в комментарии
  через @», not «упомяните его через @» (where?) nor «упомяните его в
  комментарии» (how?).
- Pronouns agree with what they replace. Check «те», «там», «который» against
  the noun: «На вкладке «Мои открытые» задачи, где вы владелец, на вкладке
  «Остальные открытые» там, где вы участник».
- Say the reason, not a slogan. «По часам судят об объёме работы, а не о
  людях» states a rule without why; say why: an hour of an experienced person
  costs more, so the simple part goes to a junior, and the total describes the
  task.
- No office jargon (осуществляется, данный, в рамках, является) and no
  English loans where a Russian word exists.
- One idea is explained in one place (decision 92): before adding a sentence
  to the guide, search it for the same idea.

## Proofreading pass (always, before committing)

1. Read every new or changed Russian sentence as if aloud. Rewrite any that a
   person would not say, or that only makes sense next to the English.
2. Run the mechanical check and fix what it finds:

   ```sh
   grep -n ', —' shared/i18n/ru.ts shared/i18n/help/ru.ts server/demoTexts.ts
   grep -n ' — ' <changed file>   # each one: is it a definition? if not, use a word
   ```
3. In the reply to the user, quote the new or changed Russian sentences, so
   they can be checked without reading the diff.
