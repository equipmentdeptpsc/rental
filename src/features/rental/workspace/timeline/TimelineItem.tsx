import {
  ClipboardList,
  Truck,
  User,
  FileText,
  Receipt,
  CreditCard,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";

import type {
  TimelineEvent,
  TimelineEventType,
} from "./types";

interface Props {
  event: TimelineEvent;

  isLast?: boolean;
}

const EVENT_STYLE: Record<
  TimelineEventType,
  {
    icon: React.ElementType;
    badge: string;
  }
> = {
  rental: {
    icon: ClipboardList,
    badge:
      "bg-blue-100 text-blue-700",
  },

  assignment: {
    icon: Truck,
    badge:
      "bg-green-100 text-green-700",
  },

  operator: {
    icon: User,
    badge:
      "bg-orange-100 text-orange-700",
  },

  deur: {
    icon: FileText,
    badge:
      "bg-purple-100 text-purple-700",
  },

  billing: {
    icon: Receipt,
    badge:
      "bg-emerald-100 text-emerald-700",
  },

  invoice: {
    icon: Receipt,
    badge:
      "bg-indigo-100 text-indigo-700",
  },

  collection: {
    icon: CreditCard,
    badge:
      "bg-cyan-100 text-cyan-700",
  },

  return: {
    icon: RotateCcw,
    badge:
      "bg-slate-100 text-slate-700",
  },

  closing: {
    icon: CheckCircle2,
    badge:
      "bg-red-100 text-red-700",
  },
};

export default function TimelineItem({
  event,
  isLast = false,
}: Props) {
  const style =
    EVENT_STYLE[event.type];

  const Icon = style.icon;

  return (
    <div className="flex gap-5">

      <div className="flex flex-col items-center">

        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full ${style.badge}`}
        >
          <Icon size={18} />
        </div>

        {!isLast && (
          <div className="mt-2 h-full w-px bg-slate-200" />
        )}

      </div>

      <div className="flex-1 pb-8">

        <div className="flex items-center gap-3">

          <div className="font-semibold text-slate-800">
            {event.title}
          </div>

          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              event.completed
                ? "bg-green-100 text-green-700"
                : "bg-yellow-100 text-yellow-700"
            }`}
          >
            {event.completed
              ? "Completed"
              : "Pending"}
          </span>

        </div>

        <div className="mt-1 text-sm text-slate-500">
          {event.description}
        </div>

        <div className="mt-2 text-xs text-slate-400">
          {event.date}
        </div>

      </div>

    </div>
  );
}