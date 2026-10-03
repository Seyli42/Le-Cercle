/**
 * "This app session started from a reminder": no full-screen ad may then appear (the
 * person came to confirm an intake). Kept in memory, reset when the app goes to the
 * background. No native import, so the reminder code can use it freely.
 */
let fromReminder = false;

export const noteOpenedFromReminder = (): void => {
  fromReminder = true;
};
export const resetAdSession = (): void => {
  fromReminder = false;
};
export const isOpenedFromReminder = (): boolean => fromReminder;
