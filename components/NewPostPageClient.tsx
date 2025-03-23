"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "next-auth/react";
import nextDynamic from "next/dynamic";
import TurndownService from "turndown";
import { injectAltText } from "@/app/extensions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import React from "react";

interface RichTextEditorProps {
  editorRef?: React.RefObject<any>;
  output?: "html" | "markdown";
  content: string;
  onChangeContent: (value: string) => void;
  extensions: any[];
  dark?: boolean;
  disabled?: boolean;
}

const RichTextEditor = nextDynamic(
  () =>
    import("reactjs-tiptap-editor").then((mod) => {
      const Component = mod.default;
      return {
        // eslint-disable-next-line react/display-name
        default: React.forwardRef<any, RichTextEditorProps>((props, ref) => {
          const safeProps = {
            ...props,
            output:
              props.output === "markdown" ? "html" : props.output || "html",
          };
          return <Component {...safeProps} ref={ref} />;
        }),
      };
    }),
  { ssr: false }
);

export default function NewPostPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session, status } = useSession();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [featureImage, setFeatureImage] = useState("");
  const [featureImageAlt, setFeatureImageAlt] = useState("");
  const [outputFormat, setOutputFormat] = useState<"html" | "markdown">("html");
  const [isLoading, setIsLoading] = useState(false);
  const [extensions, setExtensions] = useState<any[]>([]);
  const editor = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [packageIds, setPackageIds] = useState<string[]>([]);
  const [packageInput, setPackageInput] = useState("");
  const [packages, setPackages] = useState<any[]>([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const turndownService = new TurndownService();

  useEffect(() => {
    import("@/app/extensions").then((mod) => {
      setExtensions(mod.extensions);
    });
  }, []);

  turndownService.addRule("images", {
    filter: "img",
    replacement: (content: string, node: any) => {
      const alt = node.getAttribute("alt") || "";
      const src = node.getAttribute("src");
      return `![${alt}](${src})`;
    },
  });

  turndownService.addRule("cardBlock", {
    filter: (node: any) =>
      node.nodeName === "DIV" &&
      node.getAttribute("data-type") === "card-block",
    replacement: (_content: any, node: any) => {
      const cardId = node.getAttribute("data-card-id");
      return `[Card Block ID: ${cardId}]`;
    },
  });

  const insertCardBlock = () => {
    if (typeof window !== "undefined" && editor.current) {
      const cardId = prompt("Enter Card ID:");
      if (cardId) {
        editor.current.commands.insertCardBlock({ cardId, position: 0 });
      }
    }
  };

  const handleFeatureImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const imageUploadButton = document.getElementById(
        "featureImageUploadBtn"
      );
      if (imageUploadButton) {
        imageUploadButton.textContent = "Uploading...";
        imageUploadButton.setAttribute("disabled", "true");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "image");

      console.log("Uploading feature image:", file.name);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Feature image upload failed");
      const { url } = await response.json();

      console.log("Feature image uploaded successfully to:", url);
      setFeatureImage(url);
      if (!featureImageAlt) {
        setFeatureImageAlt(file.name.split(".")[0] || "");
      }

      toast({
        title: "Success",
        description: "Feature image uploaded successfully",
      });
    } catch (error: unknown) {
      console.error("Feature image upload error:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to upload feature image",
        variant: "destructive",
      });
    } finally {
      const imageUploadButton = document.getElementById(
        "featureImageUploadBtn"
      );
      if (imageUploadButton) {
        imageUploadButton.textContent = "Upload Image";
        imageUploadButton.removeAttribute("disabled");
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const fetchPackage = async (packageId: string) => {
    try {
      setIsLoadingPackages(true);
      const response = await fetch(`https://staging.holidaytribe.com:3000/package/getPackageByIds/${packageId}`);
      if (!response.ok) throw new Error("Failed to fetch package");
      
      const data = await response.json();
      if (data.status && data.result && data.result[0]) {
        console.log("Package fetched successfully:", data.result[0]);
        // Add to packages list if not already present
        setPackages(prev => {
          if (prev.some(p => p.id === data.result[0].id)) {
            return prev;
          }
          return [...prev, data.result[0]];
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error fetching package:", error);
      toast({
        title: "Error",
        description: "Failed to fetch package data",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoadingPackages(false);
    }
  };

  const addPackage = async () => {
    if (!packageInput.trim()) return;
    
    // Check if already added
    if (packageIds.includes(packageInput)) {
      toast({
        title: "Already added",
        description: "This package ID is already in the list",
      });
      return;
    }
    
    const success = await fetchPackage(packageInput);
    if (success) {
      setPackageIds(prev => [...prev, packageInput]);
      setPackageInput("");
    }
  };

  const removePackage = async (packageId: string) => {
    setPackageIds(prev => prev.filter(id => id !== packageId));
    setPackages(prev => prev.filter(p => p.id !== packageId));
  };

  const insertPackagesIntoContent = () => {
    if (!editor.current || packages.length === 0) return;
    
    // Create HTML for all packages in a horizontal scrollable container
    const packagesHtml = `
      <div style="overflow-x: auto; white-space: nowrap; margin: 20px 0; padding: 10px 0; width: 100%; -webkit-overflow-scrolling: touch;">
        <div style="display: inline-flex; gap: 16px; padding: 0 4px;">
          ${packages.map(pkg => `
            <div style="display: inline-block; vertical-align: top; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); width: 280px; background: white;">
              <div style="height: 180px; overflow: hidden; position: relative; background-color: #f3f4f6;">
                <img src="/images/package.svg" alt="${pkg.name}" style="width: 100%; height: 100%; object-fit: cover; display: block;">
              </div>
              <div style="padding: 16px 20px;">
                <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #111827; line-height: 1.3; white-space: normal;">
                  ${pkg.name}
                </h3>
                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; white-space: normal;">
                  <span style="display: inline-block; font-size: 12px; color: #4b5563;">Resorts</span>
                  <span style="display: inline-block; font-size: 12px; color: #4b5563;">•</span>
                  <span style="display: inline-block; font-size: 12px; color: #4b5563;">Clubs</span>
                  <span style="display: inline-block; font-size: 12px; color: #4b5563;">•</span>
                  <span style="display: inline-block; font-size: 12px; color: #4b5563;">Beach</span>
                </div>
                <div style="font-size: 13px; color: #6b7280; margin-bottom: 12px; white-space: normal;">
                  Weekend getaway
                </div>
                <div style="font-weight: 600; font-size: 14px; color: #111827; white-space: normal;">
                  From ₹${pkg.starting_price ? pkg.starting_price.toLocaleString() : '29,000'}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    
    // Insert the content at cursor position
    editor.current.commands.insertContent(packagesHtml);
    
    toast({
      title: "Success",
      description: "Packages inserted into content",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return;
    if (!(session?.user as any)?.id) {
      toast({
        title: "Error",
        description: "You must be logged in to create a post",
        variant: "destructive",
      });
      router.push("/login");
      return;
    }

    setIsLoading(true);
    try {
      console.log("Starting post creation process");
      const slug =
        title
          .toLowerCase()
          .replace(/[^\w\s]/g, "")
          .replace(/\s+/g, "-") +
        "-" +
        Date.now().toString().slice(-6);

      console.log("New post - Sending SEO data:", {
        metaTitle,
        metaDescription,
        featureImage: featureImage
          ? featureImage.substring(0, 50) + "..."
          : null,
        featureImageAlt,
      });

      console.log("New post - Sending package IDs:", packageIds);

      const processedContent = injectAltText(content);
      console.log("Content after alt text injection:", processedContent);

      const parser = new DOMParser();
      console.log("Content being parsed:", processedContent);
      const doc = parser.parseFromString(processedContent, "text/html");
      const mediaElements = doc.querySelectorAll("img, video");
      console.log("Found media elements:", mediaElements.length);

      mediaElements.forEach((el: any, index) => {
        if (el.tagName.toLowerCase() === "img") {
          console.log(`Image ${index} - src: ${el.src.substring(0, 50)}...`);
          console.log(`Image ${index} - alt: "${el.alt}"`);
          console.log(`Image ${index} - outerHTML: ${el.outerHTML}`);
        }
      });

      const cardBlocks = doc.querySelectorAll('div[data-type="card-block"]');

      const media = Array.from(mediaElements).map((el: any) => {
        const item = {
          url: el.src,
          type: el.tagName.toLowerCase() === "img" ? "image" : "video",
          alt: el.tagName.toLowerCase() === "img" ? el.alt || "" : "",
        };
        if (el.tagName.toLowerCase() === "img") {
          console.log("Processing image for database save:", item);
        }
        return item;
      });

      let cleanContent = processedContent;
      cardBlocks.forEach((el) => {
        cleanContent = cleanContent.replace(
          el.outerHTML,
          `[Card Block ID: ${el.getAttribute("data-card-id")}]`
        );
      });

      console.log(
        "Final content to be saved:",
        outputFormat === "markdown"
          ? turndownService.turndown(cleanContent).substring(0, 200) + "..."
          : cleanContent.substring(0, 200) + "..."
      );

      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          metaTitle: metaTitle || title,
          metaDescription:
            metaDescription ||
            cleanContent.replace(/<[^>]+>/g, "").substring(0, 160),
          featureImage,
          featureImageAlt,
          packageIds,
          content:
            outputFormat === "markdown"
              ? turndownService.turndown(cleanContent)
              : cleanContent,
          slug,
          excerpt: cleanContent.replace(/<[^>]+>/g, "").substring(0, 160),
          authorId: (session?.user as any)?.id,
          media,
          cardBlocks: Array.from(cardBlocks).map(
            (el: Element, index: number) => ({
              cardId: el.getAttribute("data-card-id"),
              position: index,
            })
          ),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create post");
      }

      toast({
        title: "Success",
        description: "Post created successfully",
      });
      router.push("/dashboard/posts");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create post",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading") {
    return <div>Loading...</div>;
  }

  if (extensions.length === 0) {
    return <div>Loading editor...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">New Post</h1>
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

        <Card className="my-4 border shadow-sm">
          <CardHeader>
            <CardTitle>SEO Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="metaTitle">Meta Title (for SEO)</Label>
              <Input
                id="metaTitle"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder="Enter meta title (defaults to post title if empty)"
              />
              <p className="text-xs text-gray-500">
                {metaTitle.length} / 60 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="metaDescription">Meta Description (for SEO)</Label>
              <Textarea
                id="metaDescription"
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="Enter meta description"
                rows={3}
              />
              <p className="text-xs text-gray-500">
                {metaDescription.length} / 160 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="featureImage">Feature Image</Label>
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  id="featureImageUploadBtn"
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                >
                  Upload Image
                </Button>
                <input
                  type="file"
                  id="featureImage"
                  ref={fileInputRef}
                  onChange={handleFeatureImageUpload}
                  accept="image/*"
                  className="hidden"
                />
                {featureImage && (
                  <span className="text-sm text-gray-500">Image uploaded</span>
                )}
              </div>

              {featureImage && (
                <div className="mt-4 space-y-4">
                  <div className="relative aspect-video w-full max-w-md overflow-hidden rounded-lg border">
                    <Image
                      src={featureImage}
                      alt={featureImageAlt}
                      className="object-cover"
                      fill
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="featureImageAlt">Image Alt Text</Label>
                    <Input
                      id="featureImageAlt"
                      value={featureImageAlt}
                      onChange={(e) => setFeatureImageAlt(e.target.value)}
                      placeholder="Describe the image for accessibility"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="my-4 border shadow-sm">
          <CardHeader>
            <CardTitle>Holiday Packages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter package ID"
                value={packageInput}
                onChange={(e) => setPackageInput(e.target.value)}
              />
              <Button 
                type="button" 
                onClick={addPackage}
                disabled={isLoadingPackages}
              >
                {isLoadingPackages ? "Loading..." : "Add Package"}
              </Button>
            </div>
            
            {packageIds.length > 0 && (
              <>
                <div className="flex flex-wrap gap-2 mt-4">
                  {packageIds.map(id => (
                    <div key={id} className="flex items-center gap-1 bg-muted px-3 py-1 rounded-full">
                      <span>{id}</span>
                      <button 
                        type="button" 
                        onClick={() => removePackage(id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <span className="sr-only">Remove</span>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                
                {packages.length > 0 && (
                  <>
                   
                    
                    <div className="mt-6 overflow-x-auto pb-4">
                      <div className="flex gap-4">
                        {packages.map(pkg => (
                          <div key={pkg.id} className="flex-none w-[280px] rounded-xl overflow-hidden shadow-md bg-white">
                            <div className="h-[180px] bg-gray-100 relative">
                              <img 
                                src="/images/package.svg" 
                                alt={pkg.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="p-4">
                              <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                                {pkg.name}
                              </h3>
                              <div className="flex flex-wrap gap-1 text-xs text-gray-500 mb-2">
                                <span>Resorts</span>
                                <span>•</span>
                                <span>Clubs</span>
                                <span>•</span>
                                <span>Beach</span>
                              </div>
                              <div className="text-sm text-gray-500 mb-3">
                                Weekend getaway
                              </div>
                              <div className="font-semibold">
                                From ₹{pkg.starting_price ? pkg.starting_price.toLocaleString() : '29,000'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-2">
          <Label>Content</Label>
          <div className="flex gap-4 mb-4">
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
          <p className="text-sm text-muted-foreground mb-2">
            <strong>Tip:</strong> Double-click on images to edit alt text
          </p>
          <RichTextEditor
            editorRef={editor}
            output="html"
            content={content}
            onChangeContent={(value: string) => {
              const processedValue = injectAltText(value);
              console.log("Content updated with alt text injection");
              setContent(processedValue);
            }}
            extensions={extensions}
            dark={false}
            disabled={isLoading}
          />
        </div>

        <div className="flex justify-end space-x-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Creating..." : "Create Post"}
          </Button>
        </div>
      </form>
    </div>
  );
}
