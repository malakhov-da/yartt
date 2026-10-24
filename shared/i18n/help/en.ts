import type { Help } from './ru.ts';

// The in-app guide in English.

export const helpEn: Help = {
  title: 'How to work in yartt',
  intro:
    'yartt is a task tracker built around responsibility and security. It does not just do without projects, subtasks '
    + 'and assignees — it replaces them with more flexible mechanisms: tags instead of projects, dependencies instead of '
    + 'subtasks, one owner instead of an assignee, participants invited by name instead of access for "everyone on the project". '
    + 'The timesheet, time entries and scores of the day make work transparent, yet all of it is optional: you can use '
    + 'only tasks and tags. Everything for the day is on one screen, My day.',
  ideasTitle: 'The essentials',
  ideas: [
    {
      title: 'The owner is whose initiative it is',
      text: 'A task has one owner. Not its author and not its doer: the one whose initiative it is — they answer for the result and alone '
        + 'decide when the task is done, move its deadline and bring people in. Whoever creates a task owns it. '
        + 'Everyone else is a participant: within someone else\'s initiative they do what is needed, comment, plan their time and log '
        + 'hours, but do not close it. Handing ownership over gives the initiative away whole: the new owner does with the task what '
        + 'they decide, closing it included. To keep the result in your hands, do not hand the task over — bring the person in as a '
        + 'participant. If their part is big, they make it a task of their own with "My part", and yours waits for it.',
    },
    {
      title: 'Access only for those invited',
      text: 'A task is seen only by its participants: the owner, those the owner added or whose request for access the owner approved — '
        + 'and their managers up the chain, who join by themselves. An important idea does not spread to '
        + '"everyone on the project". Tags, priority and deadline are visible to all — a task can be found and access asked for. '
        + 'A task that concerns everyone the owner makes public.',
    },
    {
      title: 'Tags instead of projects',
      text: 'A task\'s title is a set of tags. A tag may stand for a project, a kind of work, a direction, an action or any context '
        + 'that says the point in brief: "website · homepage · lay out the banner". A task may sit in several "projects" at once, '
        + 'and a new tag for what is specific to it can be made at any moment.',
    },
    {
      title: 'Dependencies instead of subtasks',
      text: 'A follow-up task takes the tags of the one it came from and adds its own — no need to know in advance whether there will be '
        + '"subtasks". "Waits for" is more flexible than a subtask: one task may be needed by several. A dependency may carry '
        + 'a latest deadline — any later and the waiting task will not make it — and then what people promised each other is seen and kept in check.',
    },
    {
      title: 'A deadline closes the task by itself',
      text: 'When the deadline comes, the task is closed. That is on purpose: whoever started the task answers for a sensible deadline '
        + 'and watches it. Not going to make it — move the deadline in advance.',
    },
    {
      title: 'Time in the open',
      text: 'A shift is when a person worked, an entry is how much went to a task, a plan is how much is left. Together they give '
        + 'several views of the same time instead of one figure to be taken on trust. A manager can score an employee\'s day and give '
        + 'feedback. The timesheet, entries and scores are optional.',
    },
    {
      title: 'Works offline',
      text: 'Changes made without a connection are kept in the browser and sent when it is back.',
    },
  ],
  scenariosTitle: 'Use cases',
  scenarios: [
    {
      title: 'Sign in',
      steps: [
        'There are no passwords: enter your work email and a sign-in link is sent. If the company signs in through its own accounts '
          + '(SSO), press the button to sign in with them.',
        'The sign-in email is changed in the profile: the new address is confirmed by a link sent to it.',
        'yartt can be installed as an app (Install in the browser menu): it works offline too.',
      ],
    },
    {
      title: 'Start the day',
      steps: [
        'Waiting for me: mentions, new comments on your tasks, access requests and reminders that came due; everything of one task '
          + 'is under its line. Reply, or press "Done".',
        'New comments on your task are read in the task itself ("Read"). If nothing there waits for your decision, press '
          + '"No intervention needed" in it — the task leaves the list until a new comment. Waiting for me has no such button '
          + 'on purpose: comments are never skipped unread.',
        'A day before its deadline your task shows in Waiting for me: "Closes by itself in …". Not making it — move the deadline. '
          + 'When the deadline comes, the task closes and asks for a confirmation: "Confirm" or "Open again".',
        'When a task yours waits for closes, it shows in Waiting for me too — mark it "Noted".',
        'Waiting for others, under it — what waits for others: your access requests and your mentions not closed yet. '
          + 'The longest waiting on top; a request can be withdrawn right there.',
        'Start your shift with ▶ in the top line or in the Timesheet.',
      ],
    },
    {
      title: 'Create a task',
      steps: [
        'In the search of Current tasks, pick tags from the suggestions and type what is to be done.',
        'Press "New task" in the block\'s title row: a new task opens and the text typed becomes a new tag — dashed until the task is saved. '
          + 'Add a priority, a deadline and a description.',
        'A follow-up task is created from the page of the original, under "Waits for" or "Waited on by": it gets its tags, '
          + 'and you add what is specific.',
        'If a task with that title exists, a link to it appears under the field — go there and carry on.',
      ],
    },
    {
      title: 'Find a task',
      steps: [
        'The search of Current tasks forgives typos, transliteration and the wrong keyboard layout; a task is found by number too: #12.',
        'Picked tags narrow every tab — My open, My team (for a manager: the tasks of their people down the chain), Other open, Closed.',
        'A task number (#12), wherever the task is shown, is a link to it; a tag in a line of Current tasks adds itself to the search on a click.',
        'Hover a task in any list to see its description and how much each person has spent and still plans.',
      ],
    },
    {
      title: 'Run your task',
      steps: [
        'The owner changes the description, priority, deadline and title right on the task\'s page.',
        'Participants and Opened it show who opened the task and when, how much each spent and plans.',
        'A task without an owner (say, its owner left and had no manager) any participant can "Take it".',
      ],
    },
    {
      title: 'Discuss in a task',
      steps: [
        'A comment is formatted text with images and files; # attaches another task, @ mentions a participant.',
        'A task number in a comment or the context, such as #12, is a link to that task.',
        'After "Send" a comment can be pulled back into editing for a few seconds; then it is never changed or deleted.',
        '"Reply" starts a thread under a comment; the feed keeps a mark at the moment of the reply.',
        'An unfinished comment, form or edit is kept as a draft when you go to another page.',
      ],
    },
    {
      title: 'Link tasks',
      steps: [
        'On a task\'s page: "Waits for" — what it cannot be finished without; "Waited on by" — who needs it. A task is found by tags or number.',
        'Links in "Waits for" are added by the task\'s owner. A participant adds there only a new task of their own — with "My part": '
          + 'they own it, describe it within their bounds and decide when it is done; when it closes, the owner of the waiting task '
          + 'sees it in Waiting for me.',
        'Without a latest deadline a dependency only shows that a task waits for another — the line says "no latest deadline".',
        'A latest deadline is a date and time the task waited for must not finish after, or yours will not make it. '
          + 'Only the owner of the waiting task sets and changes it: click "needed by …" or "no latest deadline" on the line. '
          + 'For everyone else its hint says who may change it.',
        'Nothing is forbidden: if its deadline is later or not set, the dependency\'s line is highlighted and both tasks are "At risk" — '
          + 'yours waits for a late one, that one delays yours. You are told of every move of its deadline.',
        'The owner of the task waited for is notified of a new dependency.',
      ],
    },
    {
      title: 'Give access or ask for help',
      steps: [
        'Only the owner adds participants: "Add a participant" on the task\'s page. That is access, not an order — nothing is expected of them.',
        'To ask a participant to do something, mention them (@) in a comment and say what is needed: it lands in their Waiting for me. '
          + 'Only those already in the task can be mentioned; in a public task, anyone.',
        'If you need someone who is not in the task and you are not the owner, ask the owner to add them. They can request access themselves.',
        'The mention is closed when they reply and press "Done". If there is a lot of work, they make a task of their own with "My part" '
          + 'under "Waits for" — yours waits for it, and when it closes you see it in Waiting for me.',
      ],
    },
    {
      title: "Ask for access to someone else's task",
      steps: [
        "Someone else's private task shows in the search: tags, priority and deadline. Open it and press \"Request access\".",
        'The owner approves or rejects the request, and you are notified. Until then you can withdraw it.',
      ],
    },
    {
      title: 'Make a task public',
      steps: [
        'A task that concerns everyone (an office move, a shared service) the owner makes public: everyone sees it, comments and '
          + 'logs time on it. Its list of participants is then empty.',
        '"Make private" keeps the owner, their managers and everyone with an open mention; those who commented come back with one click.',
      ],
    },
    {
      title: 'Hand a task over or leave it',
      steps: [
        '"Hand over" gives the whole task to another owner; you stay a participant. The new owner decides everything — closing it '
          + 'included. So do not hand a task to someone who is only to do the work: bring them in as a participant, and a big part '
          + 'they make a task of their own ("My part"). A manager can hand over their report\'s tasks too.',
        '"Leave the task" when it is no longer your business. The owner cannot leave, nor a manager while their report takes part.',
      ],
    },
    {
      title: 'Close or postpone',
      steps: [
        '"Finish" sets the deadline to now: the task is closed. To reopen it, clear or move the deadline.',
        'Closed tasks are in the Closed tab, the most recent first.',
        'Several changes of the deadline within a minute are one: the history keeps the last, and owners of dependent tasks are told once it has stood for a minute.',
      ],
    },
    {
      title: 'Remind yourself',
      steps: [
        'A reminder takes a thought off your mind now and brings it back when it is due. "Remind me" on a task\'s page: when and '
          + 'about what; the reminder is seen only by you.',
        'When it is due you are notified, and the reminder shows in "Waiting for me" and stays there until you remove it or put it off '
          + '(in an hour, tomorrow, on Monday, a day before the deadline or at a time you pick).',
      ],
    },
    {
      title: 'Keep the timesheet and a plan',
      steps: [
        '"Start the shift" and "Finish" act at this moment; add a forgotten shift with the clock icon of a day, or confirm the suggestion.',
        'A shift belongs to one day: only its start and end times are set, the end by 00:00. '
          + 'Work after midnight is a shift of the next day. Shifts do not overlap: when another is in the way, yartt names its times.',
        'Time on a task for a day is one entry: "Log time" shows what is there, a new value replaces it, 0 removes it. '
          + 'One day takes at most 24 hours, all tasks together.',
        'If you worked on a past day but wrote no shift, yartt suggests one: "Looks like a shift" — confirm it with one click.',
        'Shifts and entries of a day can be fixed until your manager scores it. To fix a scored day, ask your manager to withdraw the score.',
        '"My plan" is how much more you mean to spend on the task. If the plan does not fit your working time before the deadline, '
          + 'the task is marked "At risk".',
        'All your days are in History.',
      ],
    },
    {
      title: 'Go on vacation',
      steps: ['The calendar icon in the top line: say when you are back. Until then your notifications are copied to your manager.'],
    },
    {
      title: 'Make it yours',
      steps: [
        'Profile (your avatar in the top line): name, photo, about, language, time zone, keyboard layouts, light or dark theme '
          + 'and your manager — you pick them yourself, and they are notified.',
        'My tags: the color and weight of a tag are yours alone. Weight sets the order of tags in a title, color helps spot tasks in lists.',
        'Notifications: the bell in the top line and email in your language; the company may connect other channels too.',
      ],
    },
    {
      title: 'Invite a colleague',
      steps: ['The person-with-a-plus icon in the top line: enter their email and an invitation is sent. If the company signs in '
        + 'through its own accounts (SSO), people appear by themselves on their first sign-in.'],
    },
    {
      title: 'For a manager',
      steps: [
        'My team: the share of the timesheet in tasks, scores, tasks at risk and delays of each person; the longest unseen on top.',
        "A line unfolds into charts; a person's page has their days and figures for any period, what waits for their attention "
          + '(their Waiting for me, without their reminders) and their open tasks.',
        'A score of the day is 0 to 100 with a reason: the quality of decisions, not the result of tasks. The person gets an email. '
          + 'A score can be changed (another email goes out) or withdrawn so the person can fix their timesheet.',
        '"Export" in My team: timesheet, entries and scores of the picked people for a period, for payroll, as Excel or CSV.',
        'Every Monday an email comes: days waiting for a score, tasks closed by their deadline and tasks at risk.',
        'You are a participant of every task your reports take part in, automatically.',
        'Only the direct manager dismisses someone: their tasks and reports go to that manager. The dismissed come back '
          + 'from "My dismissed" under the team table.',
      ],
    },
    {
      title: 'See how tags are doing',
      steps: [
        'The Tags block: what happened to the tasks of each tag from any day to today — open, closed, comments, people, who plans time. '
          + '"?" by a column explains each figure.',
        'By default the tags with the most tasks "In work" are on top; click a column\'s heading to sort by it.',
        'Pick several tags to see them together and one by one.',
        'A line unfolds into charts by day: how much time each person logged and how much they still plan.',
        '"Export" saves it all as CSV.',
      ],
    },
    {
      title: 'Keep a direction within an hour budget',
      steps: [
        'Hour budgets → New budget: tags, a period and how many hours you and your reports may spend on them. '
          + 'A task counts when it carries all those tags.',
        'A line shows how much of the budget is logged and the forecast — logged plus still planned; unfolded, the running total '
          + 'against the budget and the history of changes.',
        'When you set My plan on a task under a budget, you see the forecast it would make. Nothing is forbidden — it is a guide.',
        'Changing a budget makes a new version, the old one stays in the history. Your managers and your reports see it.',
      ],
    },
    {
      title: 'Set up automation',
      steps: [
        'A bot is an account for automation: builds, monitoring, integrations. Profile → Bots: create one, tick what it may change '
          + 'and keep its key — it is shown once.',
        'The bot works with tasks through the API — say, reports a broken build with a mention — and gets its notifications on its webhook.',
        'The Bots block in My day shows whether it works: calls by day and refusals.',
      ],
    },
  ],
  faqTitle: 'Questions and answers',
  faq: [
    {
      q: 'Why does a task have no title?',
      a: 'People word titles differently, and one task is found five ways. A set of tags is unique, and the suggestions offer the tags '
        + 'that already exist, so the same thing usually gets the same name. Synonyms cannot be ruled out entirely, but they become rare. '
        + 'And nothing is lost: a tag that says exactly what is specific to a task can always be made.',
    },
    {
      q: 'Why no projects or subtasks?',
      a: 'A project is a rigid hierarchy: a task belongs to one, and access to it is access to the whole project. Tags group the same way '
        + 'without a hierarchy, and access stays with those invited to the task. A subtask is tied to one parent; a dependency is not: '
        + 'one task may be needed by several, and deadlines are tied where it really is a promise.',
    },
    {
      q: 'Why no assignee?',
      a: 'With someone who sets the task and someone who does it, responsibility blurs and a task hangs on whoever cannot close it. '
        + 'In yartt a task is run by its owner, and only they decide when it is done. Others solve their part: help is asked with '
        + 'a mention, and a big part of the work goes into a follow-up task.',
    },
    {
      q: 'Why does a task close by itself when its deadline comes?',
      a: 'So that whoever started the task truly answers for its deadline. If you do not want it closed, set a sensible deadline, '
        + 'watch it and move it in advance. A manager sees tasks closed by their deadline apart from those closed by hand.',
    },
    {
      q: 'Why can I not mention someone who is not in the task?',
      a: "Who has access is the owner's decision: they answer for the task and for who sees it. So only those already taking part "
        + 'can be mentioned — a mention addresses a participant, it does not open access. Every access opened or closed is notified, '
        + 'so a task never spreads quietly.',
    },
    {
      q: "Why do managers see their reports' tasks?",
      a: 'A manager answers for their people and needs to see what they are busy with. So they become a participant of every task '
        + 'their reports take part in, all the way up the chain, with no permissions to set.',
    },
    {
      q: 'Why can a task not be deleted, nor a comment edited?',
      a: 'History should not get lost: metrics and links to the task stay right. An outdated comment is not edited but answered. '
        + 'To avoid sending something by mistake, a comment can be pulled back into editing for a few seconds.',
    },
    {
      q: 'Do I have to keep the timesheet and score days?',
      a: 'No. The timesheet, entries, plans and scores of the day are optional. You can use only tasks and tags and still get their '
        + 'flexibility and secure access; time and scores come in when you want transparency.',
    },
    {
      q: 'Why is the day scored, not a task?',
      a: 'A task takes months and ten people — it is unclear whom to score and for what. A score of the day is about the person\'s '
        + 'decisions: were the priorities right. A task may fail while the scores are good — then the plans are the problem, not the person.',
    },
    {
      q: 'Why do a task\'s hours add up, while people are not compared by hours?',
      a: 'Hours on a task or a tag are the amount of work: when tasks go by level — the simple ones to juniors, the hard ones to seniors — '
        + 'a task takes about the same time whoever fit for it does it. So a task and a tag show how much was logged in all and how much '
        + 'is still planned. People are not compared by hours: more hours is not more done. My team shows shares of each one\'s own time, '
        + 'scores and counts.',
    },
    {
      q: 'Why does my manager see my visits?',
      a: 'For transparency and trust. It works for an honest employee: the manager sees how the work really goes and can trust them more. '
        + 'And looking busy only on paper gets hard: the ribbon of the day shows when a person was here and whether that agrees with '
        + 'their shifts and entries. The rules are the same for everyone in the chain.',
    },
    {
      q: 'Why is time on a task one entry a day?',
      a: 'The timesheet is about the day: how much went to the task today. One entry keeps time from being counted twice by accident; '
        + 'a correction is replacing the value.',
    },
    {
      q: 'How not to make a tag with a typo?',
      a: 'Enter takes the tag spelled the same way, and if there is none, makes the text a new tag. The suggestions forgive typos: '
        + 'if the tag you mean is among them, pick it. Until the task is saved a new tag is dashed — you see it is new and can remove it.',
    },
    {
      q: 'Why are there no roles or admins?',
      a: 'Rights follow relationships: the owner of a task, a participant, the direct manager. Nobody gets access by a title '
        + 'that is not in the org chart.',
    },
    {
      q: 'What does "At risk" mean?',
      a: "One of two. Someone's plan of time left does not fit into their working time before the deadline — each person's time is "
        + 'compared with their own. Or a latest deadline of a dependency is broken: the task waits for one due later than it can live with, '
        + 'or it delays a task waiting for it. The reasons are in the hint on the mark.',
    },
  ],
};
