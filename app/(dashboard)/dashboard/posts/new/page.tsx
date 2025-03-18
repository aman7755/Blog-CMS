// app/(dashboard)/dashboard/posts/new/page.tsx
import nextDynamic from "next/dynamic";

// Dynamically import the entire page component to ensure no server-side prerendering
const NewPostPage = nextDynamic(
  () => import("../../../../../components/NewPostPageClient"),
  {
    ssr: false,
  }
);

export default NewPostPage;

// Explicitly force dynamic rendering
export const dynamic = "force-dynamic";
