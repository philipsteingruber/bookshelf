"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { RotateCcwIcon, SendIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";

import type { RecommendationBook } from "@/components/recommendations/recommendation-card";
import { RecommendationCard } from "@/components/recommendations/recommendation-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { assertNever } from "@/lib/utils";
import { trpc } from "@/trpc/client";

// --- Types ---

type ConversationMessage =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      type: "recommendations";
      blurb: string;
      books: RecommendationBook[];
      retried: boolean;
    }
  | { id: string; role: "assistant"; type: "answer"; text: string; books: RecommendationBook[] }
  | { id: string; role: "assistant"; type: "error"; text: string };

type StoredConversation = {
  messages: ConversationMessage[];
  includeHistory: boolean;
};

type PendingConfirm = "startOver" | "toggleOff" | "toggleOn";

// --- Constants ---

const MAX_EXCHANGES = 10;
const STORAGE_KEY_PREFIX = "bookshelf-recommendations-";

const CLASSIFICATION_ERROR_MESSAGE =
  "Couldn't figure out what you're asking for. Try rephrasing your question more clearly.";
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

// --- Helpers ---

/**
 * Serializes conversation messages for the Claude API.
 * Error turns are omitted. Assistant turns are serialized to their text form.
 */
function serializeForClaude(messages: ConversationMessage[]): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter(
      (m): m is Exclude<ConversationMessage, { role: "assistant"; type: "error" }> =>
        !(m.role === "assistant" && m.type === "error"),
    )
    .map((m) => {
      if (m.role === "user") return { role: "user", content: m.content };
      if (m.type === "recommendations") {
        return {
          role: "assistant",
          content: JSON.stringify({
            blurb: m.blurb,
            books: m.books.map(({ title, author, reason, type }) => ({
              title,
              author,
              reason,
              type,
            })),
          }),
        };
      }
      if (m.type === "answer") {
        return { role: "assistant", content: m.text };
      }
      return assertNever(m);
    });
}

const CONFIRM_DESCRIPTIONS: Record<PendingConfirm, string> = {
  startOver: "This will clear your conversation and start fresh. Continue?",
  toggleOff: "This will clear your conversation and turn off reading history context. Continue?",
  toggleOn: "This will clear your conversation and turn on reading history context. Continue?",
};

// --- Component ---

const Page = (): React.ReactElement => {
  const { userId, isSignedIn, isLoaded } = useAuth();

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const conversationEndRef = useRef<HTMLDivElement>(null);
  const storageKey = userId ? `${STORAGE_KEY_PREFIX}${userId}` : null;

  // Load persisted conversation from localStorage on mount
  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed: StoredConversation = JSON.parse(stored);
        const withIds = (parsed.messages ?? []).map((m) => {
          const withId = m.id ? m : { ...m, id: crypto.randomUUID() };
          // Backfill type for old assistant messages stored before this field was added
          if (withId.role === "assistant" && !("type" in withId)) {
            return { ...(withId as Record<string, unknown>), type: "recommendations" as const };
          }
          return withId;
        });

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMessages(withIds as ConversationMessage[]);
        setIncludeHistory(parsed.includeHistory ?? true);
      }
    } catch {
      // Silently ignore parse errors — start fresh
    }
  }, [storageKey]);

  // Persist conversation to localStorage on every change
  useEffect(() => {
    if (!storageKey) return;
    const toStore: StoredConversation = { messages, includeHistory };
    try {
      localStorage.setItem(storageKey, JSON.stringify(toStore));
    } catch {
      // Silently ignore storage errors
    }
  }, [messages, includeHistory, storageKey]);

  const clearConversation = useCallback(
    (newIncludeHistory?: boolean) => {
      setMessages([]);
      if (newIncludeHistory !== undefined) {
        setIncludeHistory(newIncludeHistory);
      }
      if (storageKey) {
        localStorage.removeItem(storageKey);
      }
    },
    [storageKey],
  );

  const { mutate: chat, isPending } = trpc.recommendations.chat.useMutation({
    onSuccess: (data) => {
      if (data.type === "recommendations") {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            type: "recommendations",
            blurb: data.blurb,
            books: data.books,
            retried: data.retried,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            type: "answer",
            text: data.text,
            books: data.books,
          },
        ]);
      }
    },
    onError: (error) => {
      const text =
        error.message === "intent_classification_failed" ? CLASSIFICATION_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE;
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", type: "error", text }]);
    },
  });

  const [isSlowQuery, setIsSlowQuery] = useState(false);
  useEffect(() => {
    if (!isPending) return;

    const timer = setTimeout(() => {
      setIsSlowQuery(true);
    }, 10000);

    return () => {
      clearTimeout(timer);
      setIsSlowQuery(false);
    };
  }, [isPending]);

  // Auto-scroll to latest message or loading indicator
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPending]);

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed || isPending) return;

    const updatedMessages: ConversationMessage[] = [
      ...messages,
      { id: crypto.randomUUID(), role: "user", content: trimmed },
    ];
    setMessages(updatedMessages);
    setPrompt("");

    // Trim to MAX_EXCHANGES before sending to Claude
    const totalExchanges = Math.floor(updatedMessages.length / 2);
    const drop = Math.max(0, totalExchanges - MAX_EXCHANGES) * 2;
    const priorMessages = serializeForClaude(updatedMessages.slice(drop, -1));

    chat({ prompt: trimmed, includeHistory, priorMessages });
  }, [prompt, isPending, messages, includeHistory, chat]);

  const handleToggle = (checked: boolean): void => {
    if (messages.length > 0) {
      setPendingConfirm(checked ? "toggleOn" : "toggleOff");
    } else {
      setIncludeHistory(checked);
    }
  };

  const handleConfirmAction = (): void => {
    if (pendingConfirm === "startOver") {
      clearConversation();
    } else if (pendingConfirm === "toggleOff") {
      clearConversation(false);
    } else if (pendingConfirm === "toggleOn") {
      clearConversation(true);
    }
    setPendingConfirm(null);
  };

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  return (
    <>
      <AlertDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear conversation?</AlertDialogTitle>
            <AlertDialogDescription>{pendingConfirm && CONFIRM_DESCRIPTIONS[pendingConfirm]}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Book Recommendations</h1>
            {messages.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPendingConfirm("startOver")}
                className="text-muted-foreground gap-1.5 text-xs"
              >
                <RotateCcwIcon className="size-3" />
                Start over
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2.5 text-sm text-neutral-500">
            <span>Include reading history</span>
            <Switch checked={includeHistory} onCheckedChange={handleToggle} aria-label="Include reading history" />
          </div>
        </div>

        {/* Conversation area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-400">
              Ask for a recommendation to get started.
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {messages.map((message) => {
                if (message.role === "user") {
                  return (
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-[60%] rounded-2xl rounded-tr-sm bg-neutral-900 px-4 py-2.5 text-sm leading-relaxed text-white dark:bg-neutral-700">
                        {message.content}
                      </div>
                    </div>
                  );
                }

                if (message.type === "error") {
                  return (
                    <div key={message.id} className="flex justify-start">
                      <div className="max-w-[75%] rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                        {message.text}
                      </div>
                    </div>
                  );
                }

                if (message.type === "answer") {
                  return (
                    <div key={message.id} className="flex flex-col gap-3">
                      <div className="max-w-[75%] rounded-xl border bg-white px-4 py-3 text-sm leading-relaxed text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                            ul: ({ children }) => <ul className="mb-2 list-disc pl-4 last:mb-0">{children}</ul>,
                            ol: ({ children }) => <ol className="mb-2 list-decimal pl-4 last:mb-0">{children}</ol>,
                            li: ({ children }) => <li className="mb-0.5">{children}</li>,
                          }}
                        >
                          {message.text}
                        </ReactMarkdown>
                      </div>
                      {message.books.length > 0 && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {message.books.map((book) => (
                            <RecommendationCard key={`${book.title}-${book.author}`} recommendation={book} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                // type === "recommendations"
                return (
                  <div key={message.id} className="flex flex-col gap-3">
                    <div className="max-w-[75%] rounded-xl border bg-white px-4 py-3 text-sm leading-relaxed text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                      {message.blurb}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {message.books.map((book) => (
                        <RecommendationCard key={`${book.title}-${book.author}`} recommendation={book} />
                      ))}
                    </div>
                    {message.retried && (
                      <span className="text-muted-foreground text-sm">
                        One or more recommendations were replaced because they were already in your library.
                      </span>
                    )}
                  </div>
                );
              })}
              {isPending && (
                <div className="flex items-center gap-2 text-sm text-neutral-400">
                  <Spinner className="size-4" />
                  {isSlowQuery ? "This is taking a bit longer than usual…" : "Finding recommendations…"}
                </div>
              )}
              <div ref={conversationEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t bg-white px-6 py-4 dark:bg-neutral-900">
          <div className="flex items-end gap-3">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Ask for a recommendation or a question about books…"
              disabled={isPending}
              className="min-h-[42px] resize-none"
              rows={1}
              autoFocus
            />
            <Button
              onClick={handleSubmit}
              disabled={isPending || !prompt.trim()}
              aria-label={isPending ? "Sending…" : "Send"}
              className="shrink-0"
            >
              {isPending ? <Spinner className="size-4" /> : <SendIcon className="size-4" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Page;
