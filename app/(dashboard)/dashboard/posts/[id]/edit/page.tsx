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

export default function EditPostPage() {
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
  const editor = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [packageIds, setPackageIds] = useState<string[]>([]);
  const [packageInput, setPackageInput] = useState("");
  const [packages, setPackages] = useState<any[]>([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);

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

        console.log("Post fetched - SEO data:", {
          metaTitle: post.metaTitle,
          metaDescription: post.metaDescription,
          featureImage: post.featureImage,
          featureImageAlt: post.featureImageAlt,
        });

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

        // Load saved package IDs if available
        if (post.packageIds && Array.isArray(post.packageIds)) {
          console.log("Loading saved package IDs:", post.packageIds);
          setPackageIds(post.packageIds);
          
          // Fetch package data for each ID
          const fetchPromises = post.packageIds.map((pkgId: string) => fetchPackage(pkgId));
          await Promise.all(fetchPromises);
        }

        // Process content to ensure alt text is preserved from the database
        if (post.content && post.media && post.media.length > 0) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(post.content, "text/html");
          const images = doc.querySelectorAll("img");

          console.log("Found", images.length, "images in the loaded content");

          // Map of image URLs to their alt text from the database
          const mediaAltMap: { [key: string]: string } = {};
          post.media.forEach((item: any) => {
            if (item.type === "image" && item.url) {
              // Store both the full URL and the path portion for more robust matching
              const fullUrl = item.url;
              const urlPath = new URL(item.url, window.location.origin)
                .pathname;

              mediaAltMap[fullUrl] = item.alt || "";
              mediaAltMap[urlPath] = item.alt || "";

              // Also store without query params if they exist
              if (fullUrl.includes("?")) {
                const baseUrl = fullUrl.split("?")[0];
                mediaAltMap[baseUrl] = item.alt || "";
              }

              console.log(`Alt text map entry: "${fullUrl}" -> "${item.alt}"`);
            }
          });

          // Apply alt text from the database to images in the content
          let contentChanged = false;
          images.forEach((img: HTMLImageElement, index) => {
            console.log(`Checking image ${index}:`, img.src);

            // Try different forms of the URL for matching
            const imgSrc = img.src;
            const imgPath = new URL(img.src, window.location.origin).pathname;
            const imgBaseUrl = img.src.includes("?")
              ? img.src.split("?")[0]
              : img.src;

            // Log current state of alt text
            console.log(`Image ${index} current alt: "${img.alt}"`);

            // Check all possible URL forms
            let altTextFound = false;
            let dbAlt = "";

            if (mediaAltMap[imgSrc] !== undefined) {
              dbAlt = mediaAltMap[imgSrc];
              altTextFound = true;
              console.log(`Found alt text match by full URL: ${imgSrc}`);
            } else if (mediaAltMap[imgPath] !== undefined) {
              dbAlt = mediaAltMap[imgPath];
              altTextFound = true;
              console.log(`Found alt text match by path: ${imgPath}`);
            } else if (mediaAltMap[imgBaseUrl] !== undefined) {
              dbAlt = mediaAltMap[imgBaseUrl];
              altTextFound = true;
              console.log(`Found alt text match by base URL: ${imgBaseUrl}`);
            } else {
              // Try a fuzzy match for images that might have slight URL differences
              // but are actually the same image
              console.log(`No exact match found, trying partial match...`);
              const imgFilename = imgPath.split("/").pop();

              for (const [url, alt] of Object.entries(mediaAltMap)) {
                const urlFilename = url.split("/").pop();
                if (imgFilename && urlFilename && imgFilename === urlFilename) {
                  dbAlt = alt;
                  altTextFound = true;
                  console.log(
                    `Found alt text match by filename: ${imgFilename}`
                  );
                  break;
                }
              }
            }

            if (altTextFound) {
              console.log(`Setting alt text for image ${index} to "${dbAlt}"`);
              img.setAttribute("alt", dbAlt);
              contentChanged = true;
            } else {
              console.log(
                `No alt text match found for image ${index}: ${imgSrc}`
              );
            }
          });

          // Only update the content if changes were made
          if (contentChanged) {
            const processedContent = doc.body.innerHTML;
            console.log("Edit page - Updated content with alt text from DB");
            setContent(processedContent);
          } else {
            console.log("No alt text changes were made to the content");
            setContent(post.content);
          }
        } else {
          setContent(post.content);
        }

        console.log(
          "Edit page - loaded post with content:",
          post.content.substring(0, 200) + "..."
        );
        console.log("Edit page - post has media:", post.media);

        // Log each image and its alt text from the database
        post.media.forEach((item: any, index: number) => {
          if (item.type === "image") {
            console.log(
              `Edit page - DB Image ${index} - url: ${item.url.substring(
                0,
                50
              )}...`
            );
            console.log(`Edit page - DB Image ${index} - alt: "${item.alt}"`);
          }
        });
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
    const packageId = prompt('Enter package ID:');
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
      console.log("Edit page - Starting post update process");

      // Process content to ensure alt tags are properly set
      const processedContent = injectAltText(content);
      console.log(
        "Edit page - Content after alt text injection:",
        processedContent.substring(0, 200) + "..."
      );

      console.log("Edit page - Sending SEO data:", {
        metaTitle,
        metaDescription,
        featureImage: featureImage
          ? featureImage.substring(0, 50) + "..."
          : null,
        featureImageAlt,
      });

      console.log("Edit page - Sending package IDs:", packageIds);

      const parser = new DOMParser();
      const doc = parser.parseFromString(processedContent, "text/html");
      const mediaElements = doc.querySelectorAll("img, video");
      console.log("Edit page - Found media elements:", mediaElements.length);

      // Debug each image's alt text in the editor
      mediaElements.forEach((el: any, index) => {
        if (el.tagName.toLowerCase() === "img") {
          console.log(
            `Edit page - Image ${index} - src: ${el.src.substring(0, 50)}...`
          );
          console.log(`Edit page - Image ${index} - alt: "${el.alt}"`);
          console.log(
            `Edit page - Image ${index} - outerHTML: ${el.outerHTML}`
          );
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
          console.log("Edit page - Processing image for update:", item);
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

      const response = await fetch(`/api/posts/${id}`, {
        method: "PUT",
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
          slug:
            title
              .toLowerCase()
              .replace(/[^\w\s]/g, "")
              .replace(/\s+/g, "-") +
            "-" +
            Date.now().toString().slice(-6),
          excerpt: cleanContent.replace(/<[^>]+>/g, "").substring(0, 160),
          authorId: (session?.user as any).id,
          media,
          cardBlocks: Array.from(cardBlocks).map(
            (el: Element, index: number) => ({
              cardId: el.getAttribute("data-card-id"),
              position: index,
            })
          ),
        }),
      });

      if (!response.ok) throw new Error("Failed to update post");
      toast({ title: "Success", description: "Post updated successfully" });
      router.push(`/dashboard/posts/27f4f873-46bd-4902-8b73-6eda8125dbd8/edit`);
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

  const removePackage = (packageId: string) => {
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
    editor.current.editor?.commands.insertContent(packagesHtml);
    
    toast({
      title: "Success",
      description: "Packages inserted into content",
    });
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
        <Button
          onClick={() =>
            router.push(
              `/dashboard/posts/27f4f873-46bd-4902-8b73-6eda8125dbd8/edit`
            )
          }
        >
          Cancel
        </Button>
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
                // Process value to ensure alt tags are applied
                const processedValue = injectAltText(value);
                console.log(
                  "Edit page - Content updated with alt text injection"
                );
                setContent(processedValue);
              }}
              extensions={extensions}
              dark={false}
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="flex justify-end space-x-4">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Post"}
          </Button>
        </div>
      </form>
    </div>
  );
}
