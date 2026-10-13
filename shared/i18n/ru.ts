import type { ErrorCode } from '../errors.ts';

// The reference translation: every other locale is typed by it.
// errors: business error messages, {{name}} are parameters from the server
// (ErrorParams). Field validation messages come from zod's own locales.
// mail: email subjects and bodies, rendered by the server.

const errors: Record<ErrorCode, string> = {
  internal: 'Что-то пошло не так. Попробуйте ещё раз.',
  invalid_input: 'Проверьте поля, отмеченные красным.',
  invalid_data: 'Данные не прошли проверку.',
  not_found: 'Не найдено — возможно, уже удалено или изменено.',
  forbidden: 'Недостаточно прав для этого действия.',
  unauthorized: 'Сессия завершилась — войдите снова.',
  invalid_token: 'Ссылка для входа недействительна: она одноразовая и действует 10 минут. Запросите новую.',
  email_taken: 'Сотрудник с таким email уже есть.',
  invalid_locale: 'Неизвестный язык.',
  invalid_time_zone: 'Неизвестный часовой пояс.',
  manager_cycle: 'Нельзя: руководители образуют цикл (сотрудник #{{employeeId}}).',
  tag_set_taken: 'Задача с таким набором тегов уже есть — добавьте тег, чтобы различить их.',
  unknown_tag: 'Неизвестный тег.',
  tag_in_use: 'Тег #{{tagId}} используется в задачах — удалить нельзя.',
  immutable_row: 'Эту запись нельзя изменить или удалить — она хранится навсегда.',
  owner_cannot_leave: 'Владелец не может выйти из задачи #{{taskId}} — сначала передайте владение.',
  manager_cannot_leave: 'Руководитель не может выйти из задачи #{{taskId}}, пока её наблюдает подчинённый.',
  not_observer: 'Сотрудник #{{employeeId}} не наблюдает задачу #{{taskId}}.',
  already_observer: 'У сотрудника #{{employeeId}} уже есть доступ к задаче #{{taskId}} или заявка на него.',
  no_pending_request: 'Заявки сотрудника #{{employeeId}} на задачу #{{taskId}} нет.',
  dependency_cycle: 'Зависимости образуют цикл.',
  hard_dependency_violated: 'Дедлайн задачи #{{taskId}} нарушает жёсткую зависимость от задачи #{{dependencyId}}: сначала сдвиньте дедлайн зависимой задачи.',
  unknown_attachment: 'Вложение не найдено.',
  attachment_in_use: 'Вложение #{{attachmentId}} используется в комментариях.',
  self_mention: 'Нельзя упомянуть себя.',
  shift_overlap: 'Смена пересекается с другой вашей сменой.',
  shift_closed: 'Закрытую смену нельзя изменить или удалить.',
  shift_in_future: 'Смена не может быть в будущем.',
  shift_open: 'Смена за этот день ещё открыта.',
  spent_immutable: 'Списание нельзя изменить — удалите и создайте заново.',
  spent_in_future: 'Нельзя списать время на будущий день.',
  day_scored: 'День уже оценён — изменения невозможны.',
  score_final: 'Оценку нельзя изменить.',
  not_manager: 'Это может сделать только непосредственный руководитель сотрудника #{{employeeId}}.',
  score_day_not_past: 'Оценить можно только прошедший день.',
  no_work_for_day: 'За этот день нет закрытых смен.',
};

export const ru = {
  common: {
    save: 'Сохранить',
    cancel: 'Отмена',
    saved: 'Сохранено',
    loading: 'Загрузка…',
  },
  nav: {
    employees: 'Сотрудники',
    profile: 'Профиль',
    logout: 'Выйти',
  },
  login: {
    title: 'Вход',
    email: 'Email',
    submit: 'Получить ссылку',
    sent: 'Если такой сотрудник есть, мы отправили ссылку для входа. Она действует 10 минут.',
    again: 'Отправить ещё раз',
    checking: 'Входим…',
    backToLogin: 'Ко входу',
  },
  employees: {
    title: 'Сотрудники',
    invite: 'Пригласить',
    name: 'Имя',
    email: 'Email',
    manager: 'Руководитель',
    dismissed: 'Уволен',
    dismiss: 'Уволить',
    dismissConfirm: 'Уволить: {{name}}? Задачи и подчинённые перейдут к вам.',
    restore: 'Вернуть',
    restoreTitle: 'Вернуть {{name}}',
    you: 'вы',
  },
  invite: {
    title: 'Пригласить сотрудника',
    fullName: 'Имя',
    email: 'Email',
    submit: 'Пригласить',
  },
  profile: {
    title: 'Профиль',
    fullName: 'Имя',
    about: 'Как со мной связаться',
    nextDay: 'В отпуске до',
    nextDayHint: 'Пока дата в будущем, уведомления дублируются руководителю.',
    timeZone: 'Часовой пояс',
    locale: 'Язык',
    manager: 'Мой руководитель',
    noManager: 'Нет',
    sessions: 'Сессии',
    logoutEverywhere: 'Выйти на всех устройствах',
  },
  locales: {
    ru: 'Русский',
    en: 'English',
  },
  errors,
  mail: {
    awayCopy: 'Копия: {{name}} сейчас отсутствует.',
    open: 'Открыть: {{url}}',
    login: {
      subject: 'Вход в yartt',
      body: 'Ссылка для входа — одноразовая, действует 10 минут:\n{{url}}',
    },
    invite: {
      subject: 'Приглашение в yartt',
      body: '{{by}} приглашает вас в yartt. Войдите с этим email: {{url}}',
    },
    comment: {
      subject: 'Комментарий: {{task}}',
      body: '{{by}} оставляет комментарий к задаче «{{task}}».',
    },
    mention: {
      subject: 'Вас упомянули: {{task}}',
      body: '{{by}} упоминает вас в комментарии к задаче «{{task}}».',
    },
    task_mention: {
      subject: 'Ссылка на задачу: {{task}}',
      body: '{{by}} ссылается на вашу задачу «{{task}}».',
    },
    remind: {
      subject: 'Напоминание: {{task}}',
      body: 'Напоминание по задаче «{{task}}». {{text}}',
    },
    access_request: {
      subject: 'Запрос доступа: {{task}}',
      body: '{{employee}} просит доступ к задаче «{{task}}».',
    },
    finished_at_change: {
      subject: 'Изменился дедлайн: {{dependency}}',
      body: 'Изменился дедлайн задачи «{{dependency}}», от которой зависит ваша задача «{{task}}».',
    },
    owner_change: {
      subject: 'Вы владелец: {{task}}',
      body: 'Теперь вы владелец задачи «{{task}}». Предыдущий владелец: {{from}}.',
    },
    score: {
      subject: 'Оценка за {{day}}',
      body: 'Руководитель оценил ваш день {{day}}.',
    },
    new_report: {
      subject: 'Новый подчинённый: {{employee}}',
      body: '{{employee}} указывает вас руководителем в своём профиле.',
    },
  },
};

export type Translation = typeof ru;
