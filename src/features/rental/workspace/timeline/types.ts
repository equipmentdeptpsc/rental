export type TimelineEventType =
  | "rental"
  | "assignment"
  | "operator"
  | "deur"
  | "billing"
  | "invoice"
  | "collection"
  | "return";

export interface TimelineEvent {
  id: string;

  type: TimelineEventType;

  title: string;

  description: string;

  date: string;

  completed: boolean;
}