"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "next-auth/react";
import RichTextEditor from "reactjs-tiptap-editor";
import { extensions } from "@/app/extensions";
import TurndownService from "turndown";

export default function EditPostPage() {
  const router = useRouter();
  const { id } = useParams();
  const { toast } = useToast();
  const { data: session, status } = useSession();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [outputFormat, setOutputFormat] = useState("html");
  const [isLoading, setIsLoading] = useState(true);
  const editor = useRef(null);

  const turndownService = new TurndownService();
  turndownService.addRule("cardBlock", {
    filter: (node: any) =>
      node.nodeName === "DIV" &&
      node.getAttribute("data-type") === "card-block",
    replacement: (content: any, node: any) => {
      const cardId = node.getAttribute("data-card-id");
      return `[Card Block ID: ${cardId}]`;
    },
  });

  useEffect(() => {
    const fetchPost = async () => {
      try {
        const response = await fetch(`/api/posts/${id}`);
        if (!response.ok) throw new Error("Failed to fetch post");
        const post = await response.json();
        setTitle(post.title);
        setContent(post.content); // Assuming content is stored as HTML
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to load post",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (id) fetchPost();
  }, [id, toast]);

  const insertCardBlock = () => {
    const cardId = prompt("Enter Card ID:");
    if (cardId && editor.current) {
      (editor.current as any).commands.insertCardBlock({ cardId, position: 0 });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (status === "loading") return;
    if (!(session?.user as any).id) {
      toast({
        title: "Error",
        description: "You must be logged in to edit a post",
        variant: "destructive",
      });
      router.push("/login");
      return;
    }

    setIsLoading(true);

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "text/html");
      const mediaElements = doc.querySelectorAll("img, video");
      const cardBlocks = doc.querySelectorAll('div[data-type="card-block"]');

      const media = Array.from(mediaElements).map((el: any) => ({
        url: el.src,
        type: el.tagName.toLowerCase() === "img" ? "image" : "video",
      }));

      const cardBlocksData = Array.from(cardBlocks).map((el, index) => ({
        cardId: el.getAttribute("data-card-id"),
        position: index,
      }));

      let cleanContent = content;
      cardBlocks.forEach((el) => {
        cleanContent = cleanContent.replace(
          el.outerHTML,
          `[Card Block ID: ${el.getAttribute("data-card-id")}]`
        );
      });

      const response = await fetch(`/api/posts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content:
            outputFormat === "markdown"
              ? turndownService.turndown(cleanContent)
              : cleanContent,
          slug: title
            .toLowerCase()
            .replace(/[^\w\s]/g, "")
            .replace(/\s+/g, "-"),
          excerpt: cleanContent.replace(/<[^>]+>/g, "").substring(0, 160),
          authorId: (session?.user as any).id,
          media,
          cardBlocks: cardBlocksData,
        }),
      });

      if (!response.ok) throw new Error("Failed to update post");
      toast({ title: "Success", description: "Post updated successfully" });
      router.push("/dashboard/posts");
    } catch (error) {
      toast({
        title: "Error",
        description: (error as Error).message || "Failed to update post",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading" || isLoading) {
    return <div>Loading...</div>;
  }

  const displayedContent =
    outputFormat === "html" ? content : turndownService.turndown(content);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Edit Post</h1>
        <Button onClick={() => router.push("/dashboard/posts")}>Cancel</Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter post title"
            required
          />
        </div>

        <div className="space-y-2">
          <Label>Content</Label>
          <div className="flex gap-4 mb-4">
            <Button type="button" onClick={insertCardBlock}>
              Insert Card Block
            </Button>
            <Button
              type="button"
              onClick={() => setOutputFormat("html")}
              variant={outputFormat === "html" ? "default" : "outline"}
            >
              HTML
            </Button>
            <Button
              type="button"
              onClick={() => setOutputFormat("markdown")}
              variant={outputFormat === "markdown" ? "default" : "outline"}
            >
              Markdown
            </Button>
          </div>
          <RichTextEditor
            ref={editor}
            output="html"
            content={content}
            onChangeContent={(value) => setContent(value)}
            extensions={extensions}
            dark={false}
            disabled={isLoading}
          />
        </div>

        {/* <div className="space-y-2">
          <Label>Preview</Label>
          <textarea
            style={{ height: 200, width: "100%" }}
            readOnly
            value={displayedContent}
          />
        </div> */}

        <div className="flex justify-end space-x-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Post"}
          </Button>
        </div>
      </form>
    </div>
  );
}
