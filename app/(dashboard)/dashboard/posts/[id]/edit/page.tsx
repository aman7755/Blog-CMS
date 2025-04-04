"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "next-auth/react";
import RichTextEditor from "reactjs-tiptap-editor";
import { extensions, injectAltText } from "@/app/extensions";
import TurndownService from "turndown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import { RoleGate } from "@/components/role-gate";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function EditPostContent() {
  const router = useRouter();
  const { id } = useParams();
  const { toast } = useToast();
  const { data: session, status } = useSession();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [featureImage, setFeatureImage] = useState("");
  const [featureImageAlt, setFeatureImageAlt] = useState("");
  const [outputFormat, setOutputFormat] = useState("html");
  const [isLoading, setIsLoading] = useState(true);
  const [postStatus, setPostStatus] = useState<
    "DRAFT" | "PUBLISHED" | "ARCHIVED"
  >("DRAFT");
  const [authorId, setAuthorId] = useState("");
  const [isAuthor, setIsAuthor] = useState(false);
  const editor = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [packageIds, setPackageIds] = useState<string[]>([]);
  const [packageInput, setPackageInput] = useState("");
  const [packages, setPackages] = useState<any[]>([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const [imageAltMap, setImageAltMap] = useState<Map<string, string>>(
    new Map()
  );
  const [showAltTextManager, setShowAltTextManager] = useState<boolean>(false);
  const [customTitle, setCustomTitle] = useState("");
  const [keywords, setKeywords] = useState("");
  const [relatedBlogIds, setRelatedBlogIds] = useState<string[]>([]);
  const [selectedBlogId, setSelectedBlogId] = useState("");
  const [availableBlogs, setAvailableBlogs] = useState<any[]>([]);
  const [isLoadingBlogs, setIsLoadingBlogs] = useState(false);

  const turndownService = new TurndownService();

  // Custom rule for images to preserve alt text
  turndownService.addRule("images", {
    filter: "img",
    replacement: function (content: string, node: any) {
      const alt = node.getAttribute("alt") || "";
      const src = node.getAttribute("src");
      return `![${alt}](${src})`;
    },
  });

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
        setPostStatus(post.status);
        setAuthorId(post.authorId || "");

        // Check if the current user is the author of this post
        if (session?.user?.id === post.authorId) {
          setIsAuthor(true);
        }

        console.log("Post fetched - SEO data:", {
          metaTitle: post.metaTitle,
          metaDescription: post.metaDescription,
          featureImage: post.featureImage,
          featureImageAlt: post.featureImageAlt,
        });

        // Log relatedBlogIds to verify if they exist in the fetched data
        console.log("Post related blog IDs:", post.relatedBlogIds);

        setMetaTitle(post.metaTitle || post.title);
        setMetaDescription(
          post.metaDescription ||
            post.content.replace(/<[^>]+>/g, "").substring(0, 160)
        );

        // Set feature image data if available
        if (post.featureImage) {
          console.log(`Setting feature image: ${post.featureImage}`);
          setFeatureImage(post.featureImage);
          setFeatureImageAlt(post.featureImageAlt || "");
        } else {
          console.log("No feature image found in post data");
        }

        // Set custom title and keywords if available
        setCustomTitle(post.customTitle || "");
        setKeywords(post.keywords || "");
        
        // Load related blog IDs if available
        if (post.relatedBlogIds && Array.isArray(post.relatedBlogIds)) {
          console.log("Loading related blog IDs:", post.relatedBlogIds);
          setRelatedBlogIds(post.relatedBlogIds);
        }

        // Load saved package IDs if available
        if (post.packageIds && Array.isArray(post.packageIds)) {
          console.log("Loading saved package IDs:", post.packageIds);
          setPackageIds(post.packageIds);

          // Fetch package data for each ID
          const fetchPromises = post.packageIds.map((pkgId: string) =>
            fetchPackage(pkgId)
          );
          await Promise.all(fetchPromises);
        }

        // Create database media mapping first (used throughout the process)
        const mediaMap = new Map();
        if (post.media && Array.isArray(post.media)) {
          console.log(
            `Processing ${post.media.length} media items from database`
          );
          post.media.forEach(
            (item: { type: string; url: string; alt?: string }) => {
              if (item.type === "image" && item.url) {
                // Store the clean URL to alt mapping
                mediaMap.set(item.url, item.alt || "");

                // Also cache it globally for the editor
                if (
                  typeof window !== "undefined" &&
                  window.globalAltTextCache
                ) {
                  window.globalAltTextCache.set(item.url, item.alt || "");
                  console.log(
                    `Added to global cache: ${item.url} -> "${item.alt || ""}"`
                  );
                }

                // Log debug info
                console.log(
                  `Stored media mapping: ${item.url} -> "${item.alt || ""}"`
                );
              }
            }
          );
        }

        // Process content to ensure alt text is preserved
        if (post.content) {
          // Initialize a DOM parser for safe HTML manipulation
          const parser = new DOMParser();
          const doc = parser.parseFromString(post.content, "text/html");
          const images = doc.querySelectorAll("img");
          console.log(`Found ${images.length} images in post content`);

          let contentChanged = false;

          // First pass: Apply alt text from database to images in content
          images.forEach((img, index) => {
            const src = img.getAttribute("src") || "";
            const currentAlt = img.getAttribute("alt") || "";

            console.log(
              `Checking image ${index}: src=${src}, current alt="${currentAlt}"`
            );

            // Try to find alt text for this image from media map
            if (src && mediaMap.has(src)) {
              const dbAlt = mediaMap.get(src);

              // Only override if the current alt is empty
              if (!currentAlt && dbAlt) {
                img.setAttribute("alt", dbAlt);
                contentChanged = true;
                console.log(`Applied alt text from DB: "${dbAlt}"`);
              }
            }
          });

          // Update content if we made changes
          if (contentChanged) {
            const updatedContent = doc.body.innerHTML;
            setContent(updatedContent);
            console.log(
              "Content updated with preserved alt tags from database"
            );
          } else {
            setContent(post.content);
            console.log("No alt text changes needed, using original content");
          }
        } else {
          setContent("");
          console.log("Post had no content");
        }

        console.log(
          "Edit page - loaded post with content:",
          post.content ? post.content.substring(0, 200) + "..." : "No content"
        );

        // Sync alt text from media items for the editor components
        syncAltTextFromMediaItems(post);

        // Update our alt text manager map
        const extractedImageAltMap = extractImagesFromContent(
          post.content || ""
        );
        setImageAltMap(extractedImageAltMap);

        // Ensure all media items from DB exist in our maps
        if (post.media && Array.isArray(post.media)) {
          // This ensures we have ALL media items, even if they're not in the content
          post.media.forEach(
            (item: { type: string; url: string; alt?: string }) => {
              if (item.type === "image" && item.url) {
                // Add to alt text manager
                const newMap = new Map(extractedImageAltMap);
                if (!newMap.has(item.url)) {
                  newMap.set(item.url, item.alt || "");
                  setImageAltMap(newMap);
                }
              }
            }
          );
        }
      } catch (error) {
        console.error("Error fetching post:", error);
        toast({
          title: "Error",
          description: "Failed to fetch post data",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (id) fetchPost();
  }, [id, toast, session]);

  useEffect(() => {
    // This effect runs after the component is mounted
    // It adds a special direct DOM manipulation script to fix badges

    const fixAltTextBadges = () => {
      if (editor.current) {
        console.log("Running DOM fix for alt text badges");

        // Find the editor's DOM element
        const editorElement = document.querySelector(".ProseMirror");
        if (!editorElement) {
          console.log("Could not find editor element");
          return;
        }

        // Find all images in the editor
        const images = editorElement.querySelectorAll("img");
        console.log(`Found ${images.length} images in the editor DOM`);

        // Check each image for alt text and update badges
        images.forEach((img: HTMLImageElement, index) => {
          console.log(`Direct DOM check of image ${index}: alt="${img.alt}"`);

          const hasAlt = img.alt && img.alt.trim() !== "";

          // Find the container and badge, or create them if they don't exist
          let container = img.closest(".image-container");
          let badge;

          if (container) {
            badge = container.querySelector(".image-alt-badge");
          } else {
            // Check if the badge is a sibling
            badge = img.nextElementSibling;
            if (!badge || !badge.classList.contains("image-alt-badge")) {
              // Create a new badge if none exists
              console.log(`Creating new badge for image ${index}`);
              badge = document.createElement("span");
              badge.className = "image-alt-badge";

              // Insert it after the image
              img.parentNode?.insertBefore(badge, img.nextSibling);
            }
          }

          // Update the badge if it exists
          if (badge) {
            badge.textContent = hasAlt ? "ALT" : "";
            (badge as HTMLElement).style.backgroundColor = hasAlt
              ? "#4b5563"
              : "#ef4444";

            if (hasAlt) {
              badge.classList.remove("no-alt");
            } else {
              badge.classList.add("no-alt");
            }

            // Force visibility
            (badge as HTMLElement).style.display = "block";
            (badge as HTMLElement).style.visibility = "visible";
            (badge as HTMLElement).style.opacity = "1";

            console.log(
              `Badge updated for image ${index}: ${badge.textContent}`
            );
          }
        });
      }
    };

    // Run the fix after a delay to ensure editor is fully loaded
    const timeoutId = setTimeout(fixAltTextBadges, 1000);

    // Also run the fix whenever content changes
    const handleContentChange = () => {
      setTimeout(fixAltTextBadges, 200);
    };

    document.addEventListener("alttextchanged", handleContentChange);

    return () => {
      // Cleanup
      clearTimeout(timeoutId);
      document.removeEventListener("alttextchanged", handleContentChange);
    };
  }, []);

  useEffect(() => {
    // After component mount, run a function to remove 'NO ALT' text (but keep elements)
    const hideNoAltText = () => {
      const editorElement = document.querySelector(".ProseMirror");
      if (!editorElement) return;

      // Function to traverse DOM and hide 'NO ALT' text (but keep elements)
      const processNoAltNodes = (node: any) => {
        // Skip badge elements which already handle this differently
        if (node.classList && node.classList.contains("image-alt-badge")) {
          return;
        }

        // Check text nodes
        if (node.nodeType === 3 && node.textContent.trim() === "NO ALT") {
          node.textContent = " "; // Replace with space instead of removing
          return;
        }

        // If element has exactly 'NO ALT' text and is not a badge
        if (
          node.nodeType === 1 &&
          !node.classList?.contains("image-alt-badge") &&
          node.textContent.trim() === "NO ALT"
        ) {
          node.textContent = " "; // Replace with space instead of removing
          return;
        }

        // Process children recursively
        const children = [...node.childNodes];
        children.forEach(processNoAltNodes);
      };

      processNoAltNodes(editorElement);
    };

    // Run this cleanup on mount and whenever content changes
    const observer = new MutationObserver(() => {
      hideNoAltText();
    });

    // Start observing after a short delay to ensure editor is mounted
    setTimeout(() => {
      const editorElement = document.querySelector(".ProseMirror");
      if (editorElement) {
        hideNoAltText(); // Run once immediately
        observer.observe(editorElement, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
    }, 1000);

    return () => {
      observer.disconnect();
    };
  }, []);

  const insertCardBlock = () => {
    const cardId = prompt("Enter Card ID:");
    if (cardId && editor.current) {
      (editor.current as any).commands.insertCardBlock({ cardId, position: 0 });
    }
  };

  const insertPackageCard = () => {
    const packageId = prompt("Enter package ID:");
    if (!packageId || !editor.current) return;

    // Create a horizontal scrollable container for cards
    const containerHtml = `
      <div style="overflow-x: auto; white-space: nowrap; margin: 20px 0; padding: 10px 0; width: 100%; -webkit-overflow-scrolling: touch;">
        <div style="display: inline-flex; gap: 16px; padding: 0 4px;">
          <!-- Package cards will be inserted here -->
          <div style="display: inline-block; vertical-align: top; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); width: 280px; background: white;">
            <div style="height: 180px; overflow: hidden; position: relative; background-color: #f3f4f6;">
              <img src="/images/package.svg" alt="Package 1" style="width: 100%; height: 100%; object-fit: cover; display: block;">
            </div>
            <div style="padding: 16px 20px;">
              <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #111827; line-height: 1.3; white-space: normal;">
                Family Fun: Universal Beyond
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
                From ₹29,000
              </div>
            </div>
          </div>
          
          <div style="display: inline-block; vertical-align: top; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); width: 280px; background: white;">
            <div style="height: 180px; overflow: hidden; position: relative; background-color: #f3f4f6;">
              <img src="/images/package.svg" alt="Package 2" style="width: 100%; height: 100%; object-fit: cover; display: block;">
            </div>
            <div style="padding: 16px 20px;">
              <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #111827; line-height: 1.3; white-space: normal;">
                Family Fun: Universal Beyond
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
                From ₹29,000
              </div>
            </div>
          </div>
          
          <div style="display: inline-block; vertical-align: top; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); width: 280px; background: white;">
            <div style="height: 180px; overflow: hidden; position: relative; background-color: #f3f4f6;">
              <img src="/images/package.svg" alt="Package 3" style="width: 100%; height: 100%; object-fit: cover; display: block;">
            </div>
            <div style="padding: 16px 20px;">
              <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #111827; line-height: 1.3; white-space: normal;">
                Family Fun: Universal Beyond
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
                From ₹29,000
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Insert the horizontal scrollable container with cards
    editor.current.editor?.commands.insertContent(containerHtml);

    // We'll only fetch data if we need dynamic data - for now using static example
    // Uncomment this if you want to fetch and display dynamic data
    /*
    // Fetch package data
    fetch(`https://staging.holidaytribe.com:3000/package/getPackageByIds/${packageId}`)
      .then(response => response.json())
      .then(data => {
        if (data.status && data.result && data.result[0]) {
          const packageData = data.result[0];
          console.log("Package data received:", packageData);
          
          // Would update the container with dynamic data here
        }
      })
      .catch(error => {
        console.error('Error fetching package data:', error);
      });
    */
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title) {
      toast({
        title: "Error",
        description: "Please enter a title",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      console.log("Starting post submission with improved image handling");

      // Get the current editor content
      const editorElement = document.querySelector(".ProseMirror");
      let finalContent = editorElement
        ? editorElement.innerHTML || ""
        : content;

      // Fetch current media from the API to ensure we don't lose existing images
      console.log("Fetching current post media to ensure persistence");
      const currentPostResponse = await fetch(`/api/posts/${id}`);
      if (!currentPostResponse.ok) {
        console.error("Failed to fetch current post data");
      }

      const currentPost = await currentPostResponse.json();
      const currentMediaMap = new Map();

      // Build map of all existing media
      if (currentPost.media && Array.isArray(currentPost.media)) {
        currentPost.media.forEach((item: any) => {
          if (item.url) {
            currentMediaMap.set(item.url, item);
            console.log(
              `Found existing media: ${item.url}, alt="${item.alt || ""}"`
            );
          }
        });
      }

      // Parse the content to extract images that are actually in the content
      const parser = new DOMParser();
      const doc = parser.parseFromString(finalContent, "text/html");

      // Get all images that currently exist in the content
      const contentImages = Array.from(doc.querySelectorAll("img"));
      console.log(`Found ${contentImages.length} images in content HTML`);

      // Create a map with all media items that should be saved
      const mediaItemsMap = new Map();

      // First add all images from content
      contentImages.forEach((img) => {
        const src = img.getAttribute("src") || "";
        const alt = img.getAttribute("alt") || "";

        if (src && src.trim() !== "") {
          console.log(`Including image from content: ${src}, alt="${alt}"`);
          mediaItemsMap.set(src, {
            url: src,
            type: "image",
            alt: alt,
          });
        }
      });

      // Then add any existing media that wasn't in the content but should be preserved
      // Check the imageAltMap which contains all images we've been tracking
      imageAltMap.forEach((alt, src) => {
        if (src && src.trim() !== "" && !mediaItemsMap.has(src)) {
          console.log(
            `Preserving existing media not in content: ${src}, alt="${alt}"`
          );
          mediaItemsMap.set(src, {
            url: src,
            type: "image",
            alt: alt,
          });
        }
      });

      // Ensure any media from the database that wasn't in our maps is also preserved
      currentMediaMap.forEach((item, url) => {
        if (!mediaItemsMap.has(url)) {
          console.log(
            `Preserving database media: ${url}, alt="${item.alt || ""}"`
          );
          mediaItemsMap.set(url, item);
        }
      });

      // Convert the map to an array for the API
      const mediaItems = Array.from(mediaItemsMap.values());
      console.log(`Prepared ${mediaItems.length} media items for submission`);

      // Extract card blocks
      const cardBlocks = Array.from(
        doc.querySelectorAll('div[data-type="card-block"]')
      ).map((block) => {
        const cardId = block.getAttribute("data-card-id") || "";
        const position = block.getAttribute("data-position") || "0";
        return {
          cardId,
          position: parseInt(position),
        };
      });

      // Handle markdown conversion if needed
      let finalSubmitContent = finalContent;
      if (outputFormat === "markdown") {
        finalSubmitContent = turndownService.turndown(finalContent);
      }

      // Generate a slug from the title
      const slug = title
        .toLowerCase()
        .replace(/[^\w\s]/gi, "")
        .replace(/\s+/g, "-");

      // Create the data object for the API
      const postData = {
        id,
        title,
        content: finalSubmitContent,
        slug,
        status: postStatus,
        excerpt:
          metaDescription || finalSubmitContent.substring(0, 157) + "...",
        authorId,
        metaTitle,
        metaDescription,
        featureImage,
        featureImageAlt,
        media: mediaItems,
        cardBlocks,
        packageIds,
        customTitle,
        keywords,
        relatedBlogIds,
        manualId: id, // Ensure we're sending the ID as manualId for API compatibility
      };

      // Log the relatedBlogIds before sending to verify
      console.log("Submitting relatedBlogIds:", relatedBlogIds);
      console.log("Full post data being sent:", postData);

      // Update the post via API
      const response = await fetch(`/api/posts/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(postData),
      });

      // Read the response first - but don't await it twice
      let responseData;
      try {
        responseData = await response.json();
      } catch (parseError) {
        console.error("Error parsing response:", parseError);
        throw new Error("Failed to parse server response");
      }
      
      if (!response.ok) {
        // Extract meaningful error message from various formats
        let errorMessage = "Failed to update post";
        let errorDetail = "";
        console.error("API Error Response:", responseData);
        
        if (responseData) {
          if (typeof responseData.error === 'string') {
            // If it's a simple string error
            errorMessage = responseData.error;
          }
          
          // Check for the structured errorDetail from our updated API
          if (responseData.errorDetail) {
            const detail = responseData.errorDetail;
            
            if (detail.type === 'unique_constraint') {
              errorMessage = detail.message || `A post with this ${detail.field} already exists`;
              errorDetail = `Please use a different ${detail.field}`;
            } else if (detail.type === 'foreign_key_constraint') {
              errorMessage = "Reference error";
              errorDetail = detail.message || "One of the references in your post doesn't exist";
            }
          } else if (responseData.error && typeof responseData.error !== 'string') {
            // Fallback for other error formats
            const errorStr = JSON.stringify(responseData.error);
            if (errorStr.includes("Unique constraint failed")) {
              const match = errorStr.match(/Unique constraint failed on the fields: \(\`([^`]+)`\)/);
              if (match && match[1]) {
                errorMessage = `A post with this ${match[1]} already exists`;
                errorDetail = "Please use a different " + match[1];
              } else {
                errorMessage = "A post with these details already exists";
                errorDetail = "Please check for duplicate content";
              }
            } else if (errorStr.includes("Foreign key constraint failed")) {
              errorMessage = "Reference error";
              errorDetail = "One of the references in your post points to an item that doesn't exist";
            } else {
              // Use the error object as a string
              errorMessage = "Update failed";
              errorDetail = errorStr.substring(0, 100); // Limit length for toast
            }
          }
        }
        
        toast({
          title: "Error",
          description: errorDetail ? `${errorMessage}: ${errorDetail}` : errorMessage,
          variant: "destructive",
        });
        
        throw new Error(errorMessage);
      }

      console.log("API response after update:", responseData);
      
      toast({
        title: "Success",
        description: "Post updated successfully",
      });

      // Redirect to posts list
      router.push("/dashboard/posts");
    } catch (error) {
      console.error("Error updating post:", error);
      
      // Don't show another toast if we already showed one for the API error
      if (!(error instanceof Error && error.message.includes("already exists"))) {
        toast({
          title: "Error",
          description: (error as Error).message || "Failed to update post",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeatureImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      // Use a local loading state just for the image upload
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

      // Use filename as default alt text
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
      // Reset the button state
      const imageUploadButton = document.getElementById(
        "featureImageUploadBtn"
      );
      if (imageUploadButton) {
        imageUploadButton.textContent = "Upload Image";
        imageUploadButton.removeAttribute("disabled");
      }

      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const fetchPackage = async (packageId: string) => {
    try {
      setIsLoadingPackages(true);

      // Try a direct fetch first
      try {
        const response = await fetch(
          `https://staging.holidaytribe.com:3000/package/getPackageByIds/${packageId}`
        );

        if (response.ok) {
          const data = await response.json();
          if (data.status && data.result && data.result[0]) {
            console.log("Package fetched successfully:", data.result[0]);
            // Add to packages list if not already present
            setPackages((prev) => {
              if (prev.some((p) => p.id === data.result[0].id)) {
                return prev;
              }
              return [...prev, data.result[0]];
            });
            return true;
          }
        }

        // If direct fetch fails, throw error to use fallback
        throw new Error("API fetch failed");
      } catch (apiError) {
        console.warn("Direct API fetch failed, using fallback data:", apiError);

        // Create a fallback package with the provided ID
        const fallbackPackage = {
          id: packageId,
          name: `Package ${packageId.substring(0, 8)}`,
          starting_price: 29000 + Math.floor(Math.random() * 10000),
          description: "Package details unavailable",
        };

        // Add fallback package to the list
        setPackages((prev) => {
          if (prev.some((p) => p.id === packageId)) {
            return prev;
          }
          return [...prev, fallbackPackage];
        });

        // Return true since we've added a fallback
        return true;
      }
    } catch (error) {
      console.error("Error in fetchPackage:", error);
      toast({
        title: "Warning",
        description: "Using local data - package service unavailable",
      });
      return true; // Still return true to add the ID to the list
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
      setPackageIds((prev) => [...prev, packageInput]);
      setPackageInput("");
    }
  };

  const removePackage = (packageId: string) => {
    setPackageIds((prev) => prev.filter((id) => id !== packageId));
    setPackages((prev) => prev.filter((p) => p.id !== packageId));
  };

  const insertPackagesIntoContent = () => {
    if (!editor.current || packages.length === 0) return;

    // Create HTML for all packages in a horizontal scrollable container
    const packagesHtml = `
      <div style="overflow-x: auto; white-space: nowrap; margin: 20px 0; padding: 10px 0; width: 100%; -webkit-overflow-scrolling: touch;">
        <div style="display: inline-flex; gap: 16px; padding: 0 4px;">
          ${packages
            .map(
              (pkg) => `
            <div style="display: inline-block; vertical-align: top; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); width: 280px; background: white;">
              <div style="height: 180px; overflow: hidden; position: relative; background-color: #f3f4f6;">
                <img src="/images/package.svg" alt="${
                  pkg.name
                }" style="width: 100%; height: 100%; object-fit: cover; display: block;">
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
                  From ₹${
                    pkg.starting_price
                      ? pkg.starting_price.toLocaleString()
                      : "29,000"
                  }
                </div>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    // Insert the content at cursor position
    editor.current.editor?.commands.insertContent(packagesHtml);

    toast({
      title: "Success",
      description: "Packages inserted into content",
    });
  };

  // Add a more aggressive method to force alt text to be visible and editable
  useEffect(() => {
    if (content && !isLoading) {
      console.log("Executing aggressive alt text loader effect");

      // Force a refresh of all images' alt text after loading content
      const refreshAltText = () => {
        try {
          // Use the DOM parser to extract image information
          const parser = new DOMParser();
          const doc = parser.parseFromString(content, "text/html");
          const images = doc.querySelectorAll("img");
          console.log(
            `Found ${images.length} images in content to force refresh`
          );

          // Build a map of image URLs to alt text
          const imgAltMap = new Map();
          images.forEach((img, index) => {
            const src = img.getAttribute("src") || "";
            const alt = img.getAttribute("alt") || "";
            if (src) {
              console.log(`Saving image #${index} mapping: ${src} -> "${alt}"`);
              imgAltMap.set(src, alt);
            }
          });

          // After a delay, force the alt text onto any editor images
          setTimeout(() => {
            const editorImages = document.querySelectorAll(".ProseMirror img");
            console.log(
              `Found ${editorImages.length} images in editor to update`
            );

            // Apply the saved alt text
            editorImages.forEach((element, index) => {
              const img = element as HTMLImageElement;
              if (img.src && imgAltMap.has(img.src)) {
                const savedAlt = imgAltMap.get(img.src);
                console.log(
                  `Force-applying alt="${savedAlt}" to editor image #${index}`
                );
                img.alt = savedAlt;

                // Dispatch an event to make sure badges update
                const event = new CustomEvent("alttextchanged", {
                  detail: { src: img.src, alt: savedAlt },
                });
                document.dispatchEvent(event);
              }
            });
          }, 800);
        } catch (error) {
          console.error("Error in refreshAltText:", error);
        }
      };

      // Run immediately
      refreshAltText();

      // Also run this on any resize or user interaction to handle edge cases
      const refreshEvents = ["resize", "mouseup", "touchend"];
      const debouncedRefresh = () => {
        clearTimeout((window as any)._altRefreshTimeout);
        (window as any)._altRefreshTimeout = setTimeout(refreshAltText, 500);
      };

      refreshEvents.forEach((evt) =>
        window.addEventListener(evt, debouncedRefresh)
      );

      return () => {
        refreshEvents.forEach((evt) =>
          window.removeEventListener(evt, debouncedRefresh)
        );
      };
    }
  }, [content, isLoading]);

  const extractImagesFromContent = (htmlContent: string) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, "text/html");
      const images = doc.querySelectorAll("img");
      const newImageAltMap = new Map();

      images.forEach((img, index) => {
        const src = img.getAttribute("src") || "";
        const alt = img.getAttribute("alt") || "";
        if (src) {
          newImageAltMap.set(src, alt);
        }
      });

      return newImageAltMap;
    } catch (error) {
      console.error("Error extracting images:", error);
      return new Map();
    }
  };

  useEffect(() => {
    if (content) {
      const newImageAltMap = extractImagesFromContent(content);
      setImageAltMap(newImageAltMap);
    }
  }, [content]);

  const updateAllAltTexts = () => {
    if (!content || !editor.current) return;

    try {
      // Create a new DOM to modify content
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "text/html");
      const images = doc.querySelectorAll("img");
      let contentChanged = false;

      // Update alt text for each image
      images.forEach((img) => {
        const src = img.getAttribute("src") || "";
        if (src && imageAltMap.has(src)) {
          const newAlt = imageAltMap.get(src) || "";
          const currentAlt = img.getAttribute("alt") || "";

          if (newAlt !== currentAlt) {
            img.setAttribute("alt", newAlt);
            contentChanged = true;

            // Dispatch event for global syncing
            const event = new CustomEvent("alttextchanged", {
              detail: { src, alt: newAlt },
            });
            document.dispatchEvent(event);
          }
        }
      });

      // Update editor content if needed
      if (contentChanged) {
        const newContent = doc.body.innerHTML;
        setContent(newContent);
        editor.current.setContent(newContent);

        toast({
          title: "Success",
          description: "All image alt texts updated",
        });
      }
    } catch (error) {
      console.error("Error updating all alt texts:", error);
      toast({
        title: "Error",
        description: "Failed to update alt texts",
        variant: "destructive",
      });
    }
  };

  // Function to synchronize alt text from media items to global cache and DOM
  const syncAltTextFromMediaItems = (postData: any) => {
    if (!postData || !postData.media || !Array.isArray(postData.media)) {
      console.log("No media items to sync alt text from");
      return;
    }

    // Make sure the globalAltTextCache exists
    if (typeof window !== "undefined" && !window.globalAltTextCache) {
      window.globalAltTextCache = new Map();
    }

    console.log(`Syncing alt text from ${postData.media.length} media items`);

    // Process each media item
    postData.media.forEach((item: any) => {
      if (item.type === "image" && item.url && item.alt !== undefined) {
        console.log(`Syncing alt text for ${item.url}: "${item.alt}"`);

        // Store in global cache
        if (window.globalAltTextCache) {
          window.globalAltTextCache.set(item.url, item.alt);
        }

        // Dispatch event to notify the UI
        setTimeout(() => {
          try {
            const event = new CustomEvent("alttextchanged", {
              detail: { src: item.url, alt: item.alt },
            });
            document.dispatchEvent(event);
            console.log(`Dispatched alt text change event for ${item.url}`);
          } catch (error) {
            console.error("Error dispatching alt text event:", error);
          }
        }, 0);
      }
    });
  };

  // Also add a useEffect to periodically check and refresh alt text
  useEffect(() => {
    if (!content || isLoading) return;

    // Explicitly check for and fix images with missing alt text
    const refreshAltTexts = () => {
      try {
        // Skip if global cache doesn't exist or is empty
        if (
          !window.globalAltTextCache ||
          window.globalAltTextCache.size === 0
        ) {
          return;
        }

        // Find all images in the editor
        const images = document.querySelectorAll(".ProseMirror img");
        console.log(
          `Found ${images.length} images in editor to check for alt text`
        );

        // Check each image - fix the type casting
        Array.from(images).forEach((element) => {
          const img = element as HTMLImageElement;
          const src = img.src;
          if (src && window.globalAltTextCache.has(src)) {
            const cachedAlt = window.globalAltTextCache.get(src);
            const currentAlt = img.getAttribute("alt") || "";

            // If alt text is missing or doesn't match, update it
            if (cachedAlt && currentAlt !== cachedAlt) {
              console.log(
                `Fixing alt text for ${src}: "${currentAlt}" => "${cachedAlt}"`
              );
              img.setAttribute("alt", cachedAlt);

              // Notify the UI
              const event = new CustomEvent("alttextchanged", {
                detail: { src, alt: cachedAlt },
              });
              document.dispatchEvent(event);
            }
          }
        });
      } catch (error) {
        console.error("Error refreshing alt texts:", error);
      }
    };

    // Run immediately
    refreshAltTexts();

    // Then set up an interval to periodically check
    const intervalId = setInterval(refreshAltTexts, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, [content, isLoading]);

  const fetchBlogs = async () => {
    try {
      setIsLoadingBlogs(true);
      const response = await fetch("/api/posts");
      if (!response.ok) throw new Error("Failed to fetch blogs");

      const data = await response.json();
      console.log("Fetched blogs:", data);
      
      let blogsData = [];
      if (data && Array.isArray(data.posts)) {
        blogsData = data.posts;
      } else if (data && Array.isArray(data)) {
        blogsData = data;
      } else {
        console.error("Unexpected API response format:", data);
        toast({
          title: "Error",
          description: "Unexpected API response format",
          variant: "destructive",
        });
        return;
      }
      
      // Filter out the current blog from available blogs
      const filteredBlogs = blogsData.filter((blog:any) => blog.id !== id);
      setAvailableBlogs(filteredBlogs);
    } catch (error) {
      console.error("Error fetching blogs:", error);
      toast({
        title: "Error",
        description: "Failed to fetch available blogs",
        variant: "destructive",
      });
    } finally {
      setIsLoadingBlogs(false);
    }
  };

  const addRelatedBlog = () => {
    if (!selectedBlogId) return;
    
    // Check if already added
    if (relatedBlogIds.includes(selectedBlogId)) {
      toast({
        title: "Already added",
        description: "This blog is already in the related blogs list",
      });
      return;
    }

    setRelatedBlogIds((prev) => [...prev, selectedBlogId]);
    setSelectedBlogId("");
  };

  const removeRelatedBlog = (blogId: string) => {
    setRelatedBlogIds((prev) => prev.filter((id) => id !== blogId));
  };

  // Add useEffect to fetch blogs
  useEffect(() => {
    fetchBlogs();
  }, []);

  if (status === "loading" || isLoading) {
    return <div>Loading...</div>;
  }

  const displayedContent =
    outputFormat === "html" ? content : turndownService.turndown(content);

  return (
    <div>
      {!isAuthor &&
        session?.user?.role !== "admin" &&
        session?.user?.role !== "editor" && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You can only edit posts that you have created unless you are an
              admin or editor.
            </AlertDescription>
          </Alert>
        )}

      <form onSubmit={handleSubmit} className="space-y-8">
      <div className="flex items-center justify-between">
          <div className="space-y-1">
        <h1 className="text-3xl font-bold">Edit Post</h1>
            <p className="text-sm text-muted-foreground">
              Make changes to your post and update its status
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select
                value={postStatus}
                onValueChange={(value: "DRAFT" | "PUBLISHED" | "ARCHIVED") =>
                  setPostStatus(value)
                }
                disabled={
                  isLoading ||
                  (!isAuthor &&
                    session?.user?.role !== "admin" &&
                    session?.user?.role !== "editor")
                }
              >
                <SelectTrigger className="w-[180px]" id="status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PUBLISHED">Published</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={
                isLoading ||
                (!isAuthor &&
                  session?.user?.role !== "admin" &&
                  session?.user?.role !== "editor")
              }
            >
              {isLoading ? "Saving..." : "Save Post"}
            </Button>
          </div>
      </div>

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

        {/* SEO Section */}
        <Card>
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
              <p className="text-xs text-muted-foreground">
                {metaTitle.length} / 60 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="metaDescription">
                Meta Description (for SEO)
              </Label>
              <Textarea
                id="metaDescription"
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="Enter meta description"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
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
                  <span className="text-sm text-muted-foreground">
                    Image uploaded
                  </span>
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

        {/* Packages Section - MOVED HERE */}
        <Card>
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
                  {packageIds.map((id) => (
                    <div
                      key={id}
                      className="flex items-center gap-1 bg-muted px-3 py-1 rounded-full"
                    >
                      <span>{id}</span>
                      <button
                        type="button"
                        onClick={() => removePackage(id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <span className="sr-only">Remove</span>×
                      </button>
                    </div>
                  ))}
                </div>

                {packages.length > 0 && (
                  <>
                    <div className="mt-6 overflow-x-auto pb-4">
                      <div className="flex gap-4">
                        {packages.map((pkg) => (
                          <div
                            key={pkg.id}
                            className="flex-none w-[280px] rounded-xl overflow-hidden shadow-md bg-white"
                          >
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
                                From ₹
                                {pkg.starting_price
                                  ? pkg.starting_price.toLocaleString()
                                  : "29,000"}
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

        {/* Additional Content Section */}
        <Card>
          <CardHeader>
            <CardTitle>Additional Content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customTitle">Display Title</Label>
              <Input
                id="customTitle"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Enter a display title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="keywords">Keywords</Label>
              <Input
                id="keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="Enter keywords separated by commas"
              />
            </div>
          </CardContent>
        </Card>

        {/* Most Read Blogs Section */}
        <Card>
          <CardHeader>
            <CardTitle>Most Read Blogs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Select
                value={selectedBlogId}
                onValueChange={setSelectedBlogId}
                disabled={isLoadingBlogs}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a blog to add" />
                </SelectTrigger>
                <SelectContent>
                  {availableBlogs.length > 0 ? (
                    availableBlogs.map((blog) => (
                      <SelectItem key={blog.id} value={blog.id || ""}>
                        {blog.id || "No ID"}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-blogs" disabled>
                      {isLoadingBlogs ? "Loading blogs..." : "No blogs available"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Button
                type="button"
                onClick={addRelatedBlog}
                disabled={isLoadingBlogs || !selectedBlogId}
              >
                Add Blog
              </Button>
            </div>

            {relatedBlogIds.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-4">
                {relatedBlogIds.map((id) => (
                  <div
                    key={id}
                    className="flex items-center gap-1 bg-muted px-3 py-1 rounded-full"
                  >
                    <span>{id}</span>
                    <button
                      type="button"
                      onClick={() => removeRelatedBlog(id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <span className="sr-only">Remove</span>×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">No related blogs selected yet</p>
            )}
            
            <p className="text-xs text-gray-500">
              Add other blog posts that are relevant or most read in relation to this post
            </p>
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

          {/* 
            For images that won't show their badges no matter what, 
            create a direct DOM overlay with the alt text info 
          */}
          <div className="relative">
          <RichTextEditor
            ref={editor}
            output="html"
            content={content}
              onChangeContent={(value) => {
                // First save any existing alt tags from the current content
                const currentAltMap = new Map();
                try {
                  const parser = new DOMParser();
                  const doc = parser.parseFromString(content, "text/html");
                  const existingImages = doc.querySelectorAll("img");
                  existingImages.forEach((img) => {
                    const src = img.getAttribute("src") || "";
                    const alt = img.getAttribute("alt") || "";
                    if (src && alt) {
                      currentAltMap.set(src, alt);
                    }
                  });
                } catch (error) {
                  console.error("Error saving current alt tags:", error);
                }

                // Process new value to ensure alt tags are applied
                // Only inject new alt text when there are empty alt attributes
                let processedValue = injectAltText(value);

                // Restore any previously set alt tags from the currentAltMap
                try {
                  const parser = new DOMParser();
                  const doc = parser.parseFromString(
                    processedValue,
                    "text/html"
                  );
                  const images = doc.querySelectorAll("img");
                  let altUpdated = false;

                  images.forEach((img) => {
                    const src = img.getAttribute("src") || "";
                    if (src && currentAltMap.has(src)) {
                      const savedAlt = currentAltMap.get(src);
                      img.setAttribute("alt", savedAlt);
                      altUpdated = true;
                      console.log(
                        `Restored alt text for ${src} -> "${savedAlt}"`
                      );
                    }
                  });

                  if (altUpdated) {
                    processedValue = doc.body.innerHTML;
                  }
                } catch (error) {
                  console.error("Error restoring alt tags:", error);
                }

                console.log(
                  "Edit page - Content updated with alt text injection"
                );
                setContent(processedValue);

                // After updating content, ensure alt text mapping is synchronized
                // This helps the editor track alt texts properly
                try {
                  setTimeout(() => {
                    // Use a DOM parser to extract all images and their alt text
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(
                      processedValue,
                      "text/html"
                    );
                    const images = doc.querySelectorAll("img");

                    // Manually trigger a custom event to update alt text displays
                    images.forEach((img) => {
                      const altText = img.getAttribute("alt") || "";
                      const src = img.getAttribute("src") || "";
                      if (src) {
                        console.log(
                          `Dispatching alt text update for ${src}: "${altText}"`
                        );
                        const event = new CustomEvent("alttextchanged", {
                          detail: { src, alt: altText },
                        });
                        document.dispatchEvent(event);
                      }
                    });
                  }, 100);
                } catch (error) {
                  console.error("Error synchronizing alt text:", error);
                }
              }}
            extensions={extensions}
            dark={false}
            disabled={isLoading}
          />
          </div>
        </div>

        {/* Alt Text Manager Button */}
        <div className="mt-4 mb-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowAltTextManager(!showAltTextManager)}
            className="mb-2"
          >
            {showAltTextManager ? "Hide" : "Show"} Alt Text Manager (
            {imageAltMap.size} images)
          </Button>

          {showAltTextManager && (
            <div className="border rounded-md p-4 space-y-4 bg-muted/50 mt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Image Alt Text Manager</h3>
                <Button type="button" size="sm" onClick={updateAllAltTexts}>
                  Apply All Changes
                </Button>
              </div>

              {Array.from(imageAltMap.entries()).length > 0 ? (
                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                  {Array.from(imageAltMap.entries()).map(
                    ([src, alt], index) => (
                      <div
                        key={src}
                        className="flex flex-col space-y-2 border-b pb-3"
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-24 h-24 relative flex-shrink-0 border rounded overflow-hidden">
                            <img
                              src={src}
                              alt={alt || "Image preview"}
                              className="object-cover w-full h-full"
                            />
                          </div>
                          <div className="flex-1 space-y-2">
                            <Label htmlFor={`alt-text-${index}`}>
                              Alt Text for Image {index + 1}
                            </Label>
                            <div className="flex gap-2">
                              <Input
                                id={`alt-text-${index}`}
                                value={alt}
                                onChange={(e) => {
                                  const newMap = new Map(imageAltMap);
                                  newMap.set(src, e.target.value);
                                  setImageAltMap(newMap);
                                }}
                                placeholder="Describe this image..."
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => {
                                  // Apply this single change immediately
                                  const newMap = new Map(imageAltMap);
                                  const currentAlt = newMap.get(src) || "";

                                  // Dispatch event for global syncing
                                  const event = new CustomEvent(
                                    "alttextchanged",
                                    {
                                      detail: { src, alt: currentAlt },
                                    }
                                  );
                                  document.dispatchEvent(event);

                                  toast({
                                    title: "Updated",
                                    description: "Alt text applied to image",
                                  });
                                }}
                              >
                                ✓
          </Button>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {src.split("/").pop()}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No images found in content
                </p>
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

export default function EditPostPage() {
  return (
    <RoleGate allowedRoles={["admin", "editor", "author"]} requireActive={true}>
      <EditPostContent />
    </RoleGate>
  );
}
