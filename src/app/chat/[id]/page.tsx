import { ChatWorkspace } from "@/components/chat-workspace";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ChatPage({ params }: Props) {
  const { id } = await params;

  return <ChatWorkspace conversationId={id} />;
}
