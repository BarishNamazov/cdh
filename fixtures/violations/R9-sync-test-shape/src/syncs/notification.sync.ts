export interface SyncDefinition {
  name: string;
  when: string;
  then: string;
}

export const notificationSync: SyncDefinition = {
  name: "course-notification",
  when: "Enrolling.courseEnrolled",
  then: "Notifying.sendNotification"
};
