import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabaseClient";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function ProductDetails({ navigation, route }) {
  const { product } = route.params;
  const [loading, setLoading] = useState(false);
  
  const [addingToCart, setAddingToCart] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [newReview, setNewReview] = useState({ rating: 5, comment: "" });
  const [user, setUser] = useState(null);
  const [stock, setStock] = useState(product.stock || 0);
  const [isLoadingReviews, setIsLoadingReviews] = useState(true);
  const [replies, setReplies] = useState({});
  const [conversations, setConversations] = useState({});
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [expandedConversations, setExpandedConversations] = useState({});
  const fadeAnim = useState(new Animated.Value(0))[0];

  const productImages = [
    product.image_url || "https://images.unsplash.com/photo-1566014633661-349c6fae61e9?w=800",
    "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=800",
    "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=800",
  ];

  // ========== FIXED: checkUser FUNCTION ==========
  const checkUser = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      console.error("Error checking user:", error);
      return null;
    }
  };

  // Fetch admin replies for reviews
  const fetchRepliesForReviews = async (reviewsData) => {
    if (!reviewsData || reviewsData.length === 0) return;
    
    try {
      const reviewIds = reviewsData.map(review => review.id);
      
      const { data: replyData, error } = await supabase
        .from("review_replies")
        .select("*")
        .in("review_id", reviewIds);
      
      if (error) {
        console.error("Error fetching replies:", error);
        return;
      }
      
      const repliesMap = {};
      replyData?.forEach(reply => {
        repliesMap[reply.review_id] = reply;
      });
      
      setReplies(repliesMap);
    } catch (error) {
      console.error("Error in fetchRepliesForReviews:", error);
    }
  };

  // Fetch conversation threads for reviews
  const fetchConversationsForReviews = async (reviewsData) => {
    if (!reviewsData || reviewsData.length === 0) return;
    
    try {
      const reviewIds = reviewsData.map(review => review.id);
      
      const { data: convData, error } = await supabase
        .from("review_conversations")
        .select("*")
        .in("review_id", reviewIds)
        .order("created_at", { ascending: true });
      
      if (error) {
        console.error("Error fetching conversations:", error);
        return;
      }
      
      const conversationsMap = {};
      convData?.forEach(conv => {
        if (!conversationsMap[conv.review_id]) {
          conversationsMap[conv.review_id] = [];
        }
        conversationsMap[conv.review_id].push(conv);
      });
      
      setConversations(conversationsMap);
    } catch (error) {
      console.error("Error in fetchConversationsForReviews:", error);
    }
  };

  const loadReviews = async () => {
    try {
      setIsLoadingReviews(true);
      
      const { data: reviewsData, error: reviewsError } = await supabase
        .from("reviews")
        .select("*")
        .eq("product_id", product.id)
        .neq("status", "deleted")
        .order("created_at", { ascending: false });

      if (reviewsError) {
        console.error("Error loading reviews:", reviewsError);
        setReviews([]);
        return;
      }

      if (reviewsData && reviewsData.length > 0) {
        const transformedReviews = reviewsData.map(review => {
          const userName = review.user_name || 
                          (review.user_email ? review.user_email.split('@')[0] : "Anonymous");
          
          return {
            id: review.id,
            product_id: review.product_id,
            user_id: review.user_id,
            rating: review.rating,
            comment: review.comment,
            user_name: userName,
            created_at: review.created_at,
            updated_at: review.updated_at,
            helpful_count: review.helpful_count || 0,
            is_verified_purchase: review.is_verified_purchase || false,
            is_local: false
          };
        });
        
        setReviews(transformedReviews);
        await fetchRepliesForReviews(transformedReviews);
        await fetchConversationsForReviews(transformedReviews);
      } else {
        setReviews([]);
      }
      
    } catch (error) {
      console.error("Error in loadReviews:", error);
      setReviews([]);
    } finally {
      setIsLoadingReviews(false);
    }
  };

  // Submit user reply to admin
  const submitUserReply = async () => {
    if (!user) {
      Alert.alert("Login Required", "Please login to reply", [
        { text: "Login", onPress: () => navigation.navigate("Login") },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }

    if (!replyMessage.trim()) {
      Alert.alert("Empty Message", "Please enter a reply message");
      return;
    }

    try {
      setIsSendingReply(true);
      
      const userName = user.user_metadata?.full_name || 
                      user.email?.split("@")[0] || 
                      "Customer";

      const newConversation = {
        review_id: selectedConversation.reviewId,
        parent_id: selectedConversation.parentId || null,
        user_id: user.id,
        user_name: userName,
        message: replyMessage.trim(),
        is_admin: false,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from("review_conversations")
        .insert([newConversation])
        .select();

      if (error) throw error;

      const updatedConversations = { ...conversations };
      if (!updatedConversations[selectedConversation.reviewId]) {
        updatedConversations[selectedConversation.reviewId] = [];
      }
      updatedConversations[selectedConversation.reviewId].push(data[0]);
      setConversations(updatedConversations);

      Alert.alert("Success", "Your reply has been sent!");
      setReplyMessage("");
      setShowReplyModal(false);
      
    } catch (error) {
      console.error("Error submitting reply:", error);
      Alert.alert("Error", "Failed to send reply. Please try again.");
    } finally {
      setIsSendingReply(false);
    }
  };

  const submitReview = async () => {
    if (!user) {
      Alert.alert("Login Required", "Please login to leave a review", [
        { text: "Login", onPress: () => navigation.navigate("Login") },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }

    if (!newReview.comment.trim() || newReview.comment.trim().length < 10) {
      Alert.alert("Review too short", "Please write a more detailed review (minimum 10 characters)");
      return;
    }

    try {
      setLoading(true);
      
      const userName = user.user_metadata?.full_name || 
                      user.email?.split("@")[0] || 
                      "Anonymous";

      const { data: existingReview } = await supabase
        .from("reviews")
        .select("*")
        .eq("product_id", product.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingReview) {
        const { data: updatedReview, error: updateError } = await supabase
          .from("reviews")
          .update({
            rating: newReview.rating,
            comment: newReview.comment.trim(),
            user_name: userName,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingReview.id)
          .select()
          .single();

        if (updateError) {
          console.error("Update error:", updateError);
          Alert.alert("Error", "Failed to update review. Please try again.");
        } else {
          const reviewObj = {
            ...updatedReview,
            user_name: userName
          };
          setReviews(reviews.map(r => 
            r.id === existingReview.id ? reviewObj : r
          ));
          Alert.alert("Success", "Review updated!");
          resetForm();
        }
      } else {
        const { data: newReviewData, error: insertError } = await supabase
          .from("reviews")
          .insert({
            product_id: product.id,
            user_id: user.id,
            rating: newReview.rating,
            comment: newReview.comment.trim(),
            user_name: userName,
            helpful_count: 0,
            is_verified_purchase: false,
            status: "pending"
          })
          .select()
          .single();

        if (insertError) {
          console.error("Insert error:", insertError);
          
          if (insertError.code === '23505') {
            Alert.alert("Already Reviewed", "You have already reviewed this product. Your review will be updated.");
            loadReviews();
          } else {
            Alert.alert("Error", "Failed to submit review. Please try again.");
          }
        } else {
          const reviewObj = {
            ...newReviewData,
            user_name: userName,
            helpful_count: 0,
            is_verified_purchase: false
          };
          setReviews([reviewObj, ...reviews]);
          Alert.alert("Success", "Thank you for your review! It will appear after admin approval.");
          resetForm();
        }
      }
      
    } catch (error) {
      console.error("Unexpected error:", error);
      Alert.alert("Error", "Failed to submit review. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const markHelpful = async (reviewId) => {
    try {
      const review = reviews.find(r => r.id === reviewId);
      if (!review) return;

      const newHelpfulCount = (review.helpful_count || 0) + 1;
      
      setReviews(reviews.map(r => 
        r.id === reviewId 
          ? { ...r, helpful_count: newHelpfulCount, user_has_helpful: true }
          : r
      ));

      const { error } = await supabase
        .from("reviews")
        .update({ helpful_count: newHelpfulCount })
        .eq("id", reviewId);

      if (error) {
        console.error("Error updating helpful count:", error);
      }
    } catch (error) {
      console.error("Error marking helpful:", error);
    }
  };

  const getReviewStats = () => {
    if (reviews.length === 0) return { average: 0, distribution: {} };
    
    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    const average = total / reviews.length;
    
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(review => {
      distribution[review.rating]++;
    });
    
    return { average, distribution };
  };

  const resetForm = () => {
    setNewReview({ rating: 5, comment: "" });
    setShowReviewForm(false);
    setTimeout(() => {
      loadReviews();
    }, 1000);
  };

  const loadStock = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("stock")
        .eq("id", product.id)
        .single();

      if (!error && data) {
        setStock(data.stock || 0);
      }
    } catch (error) {
      console.error("Error fetching stock:", error);
    }
  };

  const loadRelatedProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("category_id", product.category_id)
        .neq("id", product.id)
        .limit(4);

      if (error) throw error;
      setRelatedProducts(data || []);
    } catch (error) {
      console.error("Error loading related products:", error);
    }
  };

  const addToCart = async () => {
    if (quantity > stock) {
      Alert.alert("Not enough stock", "Please reduce quantity");
      return;
    }
    
    try {
      setAddingToCart(true);
      
      const currentUser = await checkUser();
      if (!currentUser) {
        Alert.alert('Login Required', 'Please login to add items to cart', [
          {
            text: 'Login',
            onPress: () => navigation.navigate('Login'),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]);
        return;
      }

      const newStock = stock - quantity;
      setStock(newStock);

      const { error: stockError } = await supabase
        .from("products")
        .update({ stock: newStock })
        .eq("id", product.id);
      
      if (stockError) {
        setStock(stock);
        console.error("Error updating stock:", stockError);
      }

      const { data: existingItem } = await supabase
        .from('cart_items')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('product_id', product.id)
        .single();

      if (existingItem) {
        const { error } = await supabase
          .from('cart_items')
          .update({ quantity: existingItem.quantity + quantity })
          .eq('id', existingItem.id);

        if (error) throw error;
        Alert.alert('Success', `Added ${quantity} more to cart!`);
      } else {
        const { error } = await supabase
          .from('cart_items')
          .insert({
            user_id: currentUser.id,
            product_id: product.id,
            quantity: quantity,
          });

        if (error) throw error;
        Alert.alert('Success', `Product added to cart!`);
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
      Alert.alert('Error', 'Failed to add product to cart');
    } finally {
      setAddingToCart(false);
    }
  };

  const handleBuyNow = () => {
    if (stock <= 0) {
      Alert.alert("Out of Stock", "This product is currently unavailable");
      return;
    }
    
    Alert.alert(
      `Buy ${product.name}`,
      `Proceed to checkout with ${quantity} x ${product.name}?`,
      [
        {
          text: 'Add to Cart First',
          onPress: addToCart,
        },
        { 
          text: 'Continue', 
          style: 'default',
          onPress: () => {
            addToCart().then(() => {
              navigation.navigate('Cart');
            });
          }
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${product.name} from Tropics Pools & Landscape! ${product.description}`,
        url: product.image_url,
        title: product.name,
      });
    } catch (error) {
      Alert.alert("Error", "Unable to share product");
    }
  };

  const handleFavorite = () => {
    setIsFavorite(!isFavorite);
  };

  const incrementQuantity = () => {
    setQuantity((prev) => (prev < stock ? prev + 1 : prev));
  };
  
  const decrementQuantity = () => setQuantity((prev) => Math.max(1, prev - 1));

  const toggleConversation = (reviewId) => {
    setExpandedConversations(prev => ({
      ...prev,
      [reviewId]: !prev[reviewId]
    }));
  };

  // Render conversation thread
  const renderConversationThread = (reviewId, adminReply) => {
    const convs = conversations[reviewId] || [];
    const isExpanded = expandedConversations[reviewId];
    
    if (convs.length === 0 && !adminReply) return null;
    
    return (
      <View style={styles.conversationThread}>
        <TouchableOpacity 
          style={styles.conversationHeader}
          onPress={() => toggleConversation(reviewId)}
        >
          <Ionicons 
            name={isExpanded ? "chevron-down" : "chevron-forward"} 
            size={16} 
            color="#00BFFF" 
          />
          <Text style={styles.conversationHeaderText}>
            {convs.length + (adminReply ? 1 : 0)} {convs.length + (adminReply ? 1 : 0) === 1 ? 'reply' : 'replies'}
          </Text>
        </TouchableOpacity>
        
        {isExpanded && (
          <View style={styles.conversationMessages}>
            {/* Admin Reply */}
            {adminReply && (
              <View style={[styles.messageBubble, styles.adminMessage]}>
                <View style={styles.messageHeader}>
                  <Ionicons name="shield-checkmark" size={12} color="#00BFFF" />
                  <Text style={styles.adminNameText}>Admin</Text>
                  <Text style={styles.messageDate}>{formatDate(adminReply.created_at)}</Text>
                </View>
                <Text style={styles.messageText}>{adminReply.reply_text}</Text>
                
                <TouchableOpacity 
                  style={styles.replyToMessageButton}
                  onPress={() => {
                    setSelectedConversation({
                      reviewId: reviewId,
                      parentId: null,
                      replyingTo: "Admin"
                    });
                    setShowReplyModal(true);
                  }}
                >
                  <Ionicons name="chatbubble-outline" size={12} color="#00BFFF" />
                  <Text style={styles.replyToMessageText}>Reply</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* User and Admin conversation messages */}
            {convs.map((msg) => (
              <View 
                key={msg.id} 
                style={[
                  styles.messageBubble,
                  msg.is_admin ? styles.adminMessage : styles.userMessage
                ]}
              >
                <View style={styles.messageHeader}>
                  <Ionicons 
                    name={msg.is_admin ? "shield-checkmark" : "person-circle"} 
                    size={12} 
                    color={msg.is_admin ? "#00BFFF" : "#4CAF50"} 
                  />
                  <Text style={[
                    styles.messageUserName,
                    msg.is_admin && styles.adminNameText
                  ]}>
                    {msg.is_admin ? "Admin" : msg.user_name}
                  </Text>
                  <Text style={styles.messageDate}>{formatDate(msg.created_at)}</Text>
                </View>
                <Text style={styles.messageText}>{msg.message}</Text>
                
                {!msg.is_admin && (
                  <TouchableOpacity 
                    style={styles.replyToMessageButton}
                    onPress={() => {
                      setSelectedConversation({
                        reviewId: reviewId,
                        parentId: msg.id,
                        replyingTo: msg.user_name
                      });
                      setShowReplyModal(true);
                    }}
                  >
                    <Ionicons name="chatbubble-outline" size={12} color="#00BFFF" />
                    <Text style={styles.replyToMessageText}>Reply</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  // Updated renderReviewItem with conversation thread
  const renderReviewItem = (review) => {
    const adminReply = replies[review.id];
    const hasConversation = adminReply || (conversations[review.id] && conversations[review.id].length > 0);
    
    return (
      <View key={review.id} style={styles.reviewItem}>
        <View style={styles.reviewHeader}>
          <View style={styles.reviewUserInfo}>
            <View style={styles.reviewAvatar}>
              <Text style={styles.reviewAvatarText}>
                {review.user_name?.charAt(0)?.toUpperCase() || "A"}
              </Text>
            </View>
            <View style={styles.reviewUserDetails}>
              <View style={styles.reviewNameAndVerified}>
                <Text style={styles.reviewUserName}>{review.user_name}</Text>
                {review.is_verified_purchase && (
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="checkmark-circle" size={12} color="#4CAF50" />
                    <Text style={styles.verifiedText}>Verified Purchase</Text>
                  </View>
                )}
              </View>
              <Text style={styles.reviewDate}>{formatDate(review.created_at)}</Text>
            </View>
          </View>
          <View style={styles.reviewRatingContainer}>
            {renderStarRating(review.rating)}
          </View>
        </View>
        
        <Text style={styles.reviewComment}>{review.comment}</Text>
        
        {/* Conversation Thread (Admin Reply + User Replies) */}
        {hasConversation && renderConversationThread(review.id, adminReply)}
        
        {/* Reply button for original review */}
        <View style={styles.reviewActions}>
          <TouchableOpacity 
            style={styles.replyButton}
            onPress={() => {
              if (!user) {
                Alert.alert("Login Required", "Please login to reply", [
                  { text: "Login", onPress: () => navigation.navigate("Login") },
                  { text: "Cancel", style: "cancel" },
                ]);
                return;
              }
              setSelectedConversation({
                reviewId: review.id,
                parentId: null,
                replyingTo: review.user_name
              });
              setShowReplyModal(true);
            }}
          >
            <Ionicons name="chatbubble-outline" size={14} color="#00BFFF" />
            <Text style={styles.replyButtonText}>Reply to Review</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.helpfulButton}
            onPress={() => markHelpful(review.id)}
          >
            <Ionicons name="thumbs-up-outline" size={16} color="#666" />
            <Text style={styles.helpfulButtonText}>
              Helpful ({review.helpful_count || 0})
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderImageIndicator = () => (
    <View style={styles.imageIndicator}>
      {productImages.map((_, index) => (
        <View
          key={index}
          style={[
            styles.indicatorDot,
            activeImageIndex === index && styles.activeIndicatorDot,
          ]}
        />
      ))}
    </View>
  );

  const renderStarRating = (rating, interactive = false, onRatingChange = null) => (
    <View style={styles.starRating}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity
          key={star}
          onPress={() => interactive && onRatingChange && onRatingChange(star)}
          disabled={!interactive}
        >
          <Ionicons
            name={star <= rating ? "star" : "star-outline"}
            size={interactive ? 28 : 16}
            color={star <= rating ? "#FFD700" : "#ccc"}
            style={interactive && styles.interactiveStar}
          />
        </TouchableOpacity>
      ))}
    </View>
  );

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now - date;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return "Today";
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays} days ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
      
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  const renderReviewDistribution = () => {
    const stats = getReviewStats();
    const totalReviews = reviews.length;
    
    return (
      <View style={styles.reviewDistribution}>
        {[5, 4, 3, 2, 1].map((stars) => {
          const count = stats.distribution[stars] || 0;
          const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
          
          return (
            <View key={stars} style={styles.distributionRow}>
              <Text style={styles.distributionStars}>
                {stars} {stars === 1 ? 'star' : 'stars'}
              </Text>
              <View style={styles.distributionBarContainer}>
                <View 
                  style={[
                    styles.distributionBar, 
                    { width: `${percentage}%` }
                  ]} 
                />
              </View>
              <Text style={styles.distributionCount}>{count}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  const stats = getReviewStats();

  useEffect(() => {
    checkUser();
    loadRelatedProducts();
    loadReviews();
    loadStock();

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // ========== REAL-TIME SUBSCRIPTIONS ==========
    
    const reviewsSubscription = supabase
      .channel('reviews-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reviews',
          filter: `product_id=eq.${product.id}`,
        },
        (payload) => {
          console.log('🔄 Review changed:', payload);
          loadReviews();
        }
      )
      .subscribe();

    const repliesSubscription = supabase
      .channel('replies-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'review_replies',
        },
        (payload) => {
          console.log('🔄 Reply changed:', payload);
          loadReviews();
        }
      )
      .subscribe();

    const conversationsSubscription = supabase
      .channel('conversations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'review_conversations',
        },
        (payload) => {
          console.log('🔄 Conversation changed:', payload);
          loadReviews();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(reviewsSubscription);
      supabase.removeChannel(repliesSubscription);
      supabase.removeChannel(conversationsSubscription);
    };
  }, [product.id]);

  // ========== RENDER ==========
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Product Details</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={24} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={handleFavorite}>
            <Ionicons 
              name={isFavorite ? "heart" : "heart-outline"} 
              size={24} 
              color={isFavorite ? "#FF6B6B" : "#333"} 
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.imageSection}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              const newIndex = Math.round(
                event.nativeEvent.contentOffset.x / SCREEN_WIDTH
              );
              setActiveImageIndex(newIndex);
            }}
          >
            {productImages.map((image, index) => (
              <Image
                key={index}
                source={{ uri: image }}
                style={styles.productImage}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
          {renderImageIndicator()}
          
          {product.is_featured && (
            <View style={styles.featuredTag}>
              <Text style={styles.featuredTagText}>Featured</Text>
            </View>
          )}
        </View>

        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          <View style={styles.productHeader}>
            <Text style={styles.productName}>{product.name}</Text>
            <Text style={styles.productPrice}>
              ₱ {Number(product.price || 0).toLocaleString()}
            </Text>
            <Text style={[styles.stockText, { color: stock > 0 ? "#4CAF50" : "#FF6B6B" }]}>
              {stock > 0 ? `✓ ${stock} in stock` : "✗ Out of stock"}
            </Text>
          </View>

          <Text style={styles.productDescription}>
            {product.description || "Premium quality product designed for tropical environments. Built to withstand harsh weather conditions while maintaining optimal performance."}
          </Text>

          <View style={styles.quantitySection}>
            <Text style={styles.sectionTitle}>Quantity</Text>
            <View style={styles.quantitySelector}>
              <TouchableOpacity 
                style={styles.quantityButton}
                onPress={decrementQuantity}
                disabled={quantity <= 1}
              >
                <Ionicons name="remove" size={20} color={quantity <= 1 ? "#ccc" : "#333"} />
              </TouchableOpacity>
              <Text style={styles.quantityText}>{quantity}</Text>
              <TouchableOpacity 
                style={styles.quantityButton}
                onPress={incrementQuantity}
              >
                <Ionicons name="add" size={20} color="#333" />
              </TouchableOpacity>
            </View>
            {stock > 0 && stock < 10 && (
              <Text style={styles.lowStockText}>
                Only {stock} left in stock!
              </Text>
            )}
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={[styles.button, styles.cartButton, (addingToCart || stock <= 0) && styles.disabledButton]}
              onPress={addToCart}
              disabled={addingToCart || stock <= 0}
            >
              {addingToCart ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="cart-outline" size={20} color="#fff" />
                  <Text style={styles.buttonText}>
                    {stock > 0 ? "Add to Cart" : "Out of Stock"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, styles.buyButton, stock <= 0 && styles.disabledButton]}
              onPress={handleBuyNow}
              disabled={stock <= 0}
            >
              <Ionicons name="flash-outline" size={20} color="#fff" />
              <Text style={styles.buttonText}>
                {stock > 0 ? "Buy Now" : "Out of Stock"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.reviewsSection}>
            <View style={styles.reviewsHeader}>
              <Text style={styles.sectionTitle}>Customer Reviews</Text>
              
              {reviews.length > 0 && (
                <View style={styles.reviewsSummary}>
                  <View style={styles.ratingOverview}>
                    <Text style={styles.averageRating}>{stats.average.toFixed(1)}</Text>
                    <View style={styles.overviewStars}>
                      {renderStarRating(Math.round(stats.average))}
                      <Text style={styles.reviewCount}>{reviews.length} review{reviews.length !== 1 ? 's' : ''}</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {reviews.length > 0 && renderReviewDistribution()}

            <TouchableOpacity 
              style={styles.addReviewButton}
              onPress={() => {
                if (!user) {
                  Alert.alert("Login Required", "Please login to write a review", [
                    { text: "Login", onPress: () => navigation.navigate("Login") },
                    { text: "Cancel", style: "cancel" },
                  ]);
                  return;
                }
                setShowReviewForm(!showReviewForm);
              }}
            >
              <Ionicons name="create-outline" size={18} color="#00BFFF" />
              <Text style={styles.addReviewButtonText}>
                {showReviewForm ? "Cancel Review" : "Write a Review"}
              </Text>
            </TouchableOpacity>

            {showReviewForm && (
              <View style={styles.reviewForm}>
                <Text style={styles.reviewFormTitle}>How would you rate this product?</Text>
                {renderStarRating(newReview.rating, true, (rating) => 
                  setNewReview({ ...newReview, rating })
                )}
                
                <Text style={styles.reviewFormTitle}>Your Review</Text>
                <TextInput
                  style={styles.reviewInput}
                  placeholder="Share your experience with this product... (Minimum 10 characters)"
                  placeholderTextColor="#999"
                  value={newReview.comment}
                  onChangeText={(text) => setNewReview({ ...newReview, comment: text })}
                  multiline
                  numberOfLines={4}
                />
                
                <TouchableOpacity 
                  style={styles.submitReviewButton}
                  onPress={submitReview}
                  disabled={loading || newReview.comment.trim().length < 10}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="send-outline" size={18} color="#fff" />
                      <Text style={styles.submitReviewButtonText}>Submit Review</Text>
                    </>
                  )}
                </TouchableOpacity>
                
                {newReview.comment.trim().length > 0 && newReview.comment.trim().length < 10 && (
                  <Text style={styles.minLengthWarning}>
                    Please write at least 10 characters
                  </Text>
                )}
              </View>
            )}

            {isLoadingReviews ? (
              <View style={styles.loadingReviews}>
                <ActivityIndicator size="large" color="#00BFFF" />
                <Text style={styles.loadingText}>Loading reviews...</Text>
              </View>
            ) : reviews.length > 0 ? (
              <>
                <View style={styles.reviewsListHeader}>
                  <Text style={styles.reviewsListTitle}>
                    Customer Reviews ({reviews.length})
                  </Text>
                  <Text style={styles.sortText}>Most Recent</Text>
                </View>
                {reviews.map(renderReviewItem)}
              </>
            ) : (
              <View style={styles.noReviews}>
                <Ionicons name="chatbubble-outline" size={40} color="#ccc" />
                <Text style={styles.noReviewsText}>No reviews yet</Text>
                <Text style={styles.noReviewsSubtext}>
                  Be the first to share your experience with this product
                </Text>
                <TouchableOpacity 
                  style={styles.beFirstReviewButton}
                  onPress={() => {
                    if (!user) {
                      Alert.alert("Login Required", "Please login to write a review");
                      return;
                    }
                    setShowReviewForm(true);
                  }}
                >
                  <Text style={styles.beFirstReviewText}>Be the first to review</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {relatedProducts.length > 0 && (
            <View style={styles.relatedSection}>
              <Text style={styles.sectionTitle}>Related Products</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.relatedProductsList}
              >
                {relatedProducts.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.relatedProductCard}
                    onPress={() =>
                      navigation.navigate("CategoriesTab", {
                        screen: "ProductDetails",
                        params: { product: item },
                      })
                    }
                  >
                    <Image
                      source={{ uri: item.image_url || "https://images.unsplash.com/photo-1566014633661-349c6fae61e9?w=400" }}
                      style={styles.relatedProductImage}
                    />
                    <Text style={styles.relatedProductName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.relatedProductPrice}>
                      ₱ {Number(item.price || 0).toLocaleString()}
                    </Text>
                    <Text style={[
                      styles.relatedProductStock, 
                      { color: (item.stock || 0) > 0 ? "#4CAF50" : "#FF6B6B" }
                    ]}>
                      {(item.stock || 0) > 0 ? "In Stock" : "Out of Stock"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Reply Modal */}
      <Modal
        visible={showReplyModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowReplyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Reply to {selectedConversation?.replyingTo || "Review"}
              </Text>
              <TouchableOpacity onPress={() => setShowReplyModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            <TextInput
              style={styles.modalInput}
              placeholder="Write your reply..."
              placeholderTextColor="#999"
              value={replyMessage}
              onChangeText={setReplyMessage}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowReplyModal(false);
                  setReplyMessage("");
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalSendButton, (!replyMessage.trim() || isSendingReply) && styles.modalSendDisabled]}
                onPress={submitUserReply}
                disabled={!replyMessage.trim() || isSendingReply}
              >
                {isSendingReply ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#fff" />
                    <Text style={styles.modalSendText}>Send Reply</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 15,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  headerActions: {
    flexDirection: "row",
  },
  iconButton: {
    padding: 5,
    marginLeft: 15,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  imageSection: {
    position: "relative",
  },
  productImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.8,
  },
  imageIndicator: {
    flexDirection: "row",
    position: "absolute",
    bottom: 20,
    alignSelf: "center",
  },
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.5)",
    marginHorizontal: 4,
  },
  activeIndicatorDot: {
    backgroundColor: "#fff",
    width: 20,
  },
  featuredTag: {
    position: "absolute",
    top: 20,
    right: 20,
    backgroundColor: "#FFD700",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  featuredTagText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#333",
  },
  content: {
    padding: 20,
  },
  productHeader: {
    marginBottom: 15,
  },
  productName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 8,
  },
  productPrice: {
    fontSize: 28,
    fontWeight: "700",
    color: "#00BFFF",
  },
  stockText: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  lowStockText: {
    fontSize: 12,
    color: "#FF6B35",
    marginTop: 5,
    fontStyle: "italic",
  },
  productDescription: {
    fontSize: 16,
    lineHeight: 24,
    color: "#666",
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 15,
  },
  quantitySection: {
    marginBottom: 25,
  },
  quantitySelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 8,
    alignSelf: "flex-start",
  },
  quantityButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  quantityText: {
    fontSize: 18,
    fontWeight: "600",
    marginHorizontal: 20,
    minWidth: 30,
    textAlign: "center",
  },
  actionButtons: {
    flexDirection: "row",
    marginBottom: 30,
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginHorizontal: 5,
  },
  cartButton: {
    backgroundColor: "#00BFFF",
  },
  buyButton: {
    backgroundColor: "#32CD32",
  },
  disabledButton: {
    backgroundColor: "#cccccc",
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  reviewsSection: {
    marginBottom: 25,
  },
  reviewsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  reviewsSummary: {
    alignItems: "flex-end",
  },
  ratingOverview: {
    alignItems: "center",
  },
  averageRating: {
    fontSize: 32,
    fontWeight: "700",
    color: "#333",
  },
  overviewStars: {
    alignItems: "center",
    marginTop: 4,
  },
  reviewCount: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  reviewDistribution: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
  },
  distributionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  distributionStars: {
    fontSize: 12,
    color: "#666",
    width: 60,
  },
  distributionBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: "#e0e0e0",
    borderRadius: 3,
    marginHorizontal: 10,
    overflow: "hidden",
  },
  distributionBar: {
    height: "100%",
    backgroundColor: "#FFD700",
    borderRadius: 3,
  },
  distributionCount: {
    fontSize: 12,
    color: "#666",
    width: 30,
    textAlign: "right",
  },
  addReviewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#00BFFF",
    marginBottom: 20,
    backgroundColor: "#fff",
  },
  addReviewButtonText: {
    color: "#00BFFF",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
  },
  reviewForm: {
    backgroundColor: "#f8f9fa",
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
  },
  reviewFormTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
    marginTop: 5,
  },
  reviewInput: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#333",
    textAlignVertical: "top",
    minHeight: 100,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  minLengthWarning: {
    fontSize: 12,
    color: "#FF6B6B",
    marginTop: 5,
    fontStyle: "italic",
  },
  submitReviewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#00BFFF",
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  submitReviewButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
  },
  reviewsListHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  reviewsListTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  sortText: {
    fontSize: 12,
    color: "#666",
  },
  reviewItem: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#f0f0f0",
  },
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  reviewUserInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  reviewAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#00BFFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  reviewAvatarText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  reviewUserDetails: {
    flex: 1,
  },
  reviewNameAndVerified: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  reviewUserName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginRight: 6,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(76, 175, 80, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedText: {
    fontSize: 10,
    color: "#4CAF50",
    fontWeight: "600",
    marginLeft: 2,
  },
  reviewDate: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  reviewRatingContainer: {
    marginLeft: 10,
  },
  reviewComment: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    marginBottom: 12,
  },
  conversationThread: {
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: "#F8F9FA",
    borderRadius: 10,
    overflow: "hidden",
  },
  conversationHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#F0F0F0",
  },
  conversationHeaderText: {
    fontSize: 12,
    color: "#00BFFF",
    fontWeight: "600",
    marginLeft: 6,
  },
  conversationMessages: {
    padding: 12,
  },
  messageBubble: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  adminMessage: {
    backgroundColor: "#E3F2FD",
    borderLeftWidth: 3,
    borderLeftColor: "#00BFFF",
  },
  userMessage: {
    backgroundColor: "#E8F5E9",
    borderLeftWidth: 3,
    borderLeftColor: "#4CAF50",
    marginLeft: 20,
  },
  messageHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  messageUserName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
    marginLeft: 6,
    flex: 1,
  },
  adminNameText: {
    color: "#00BFFF",
  },
  messageDate: {
    fontSize: 10,
    color: "#999",
  },
  messageText: {
    fontSize: 13,
    color: "#333",
    lineHeight: 18,
  },
  replyToMessageButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  replyToMessageText: {
    fontSize: 11,
    color: "#00BFFF",
    marginLeft: 4,
  },
  reviewActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f5f5f5",
  },
  replyButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#F0F9FF",
  },
  replyButtonText: {
    fontSize: 12,
    color: "#00BFFF",
    marginLeft: 4,
    fontWeight: "500",
  },
  helpfulButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#f5f5f5",
  },
  helpfulButtonText: {
    fontSize: 12,
    color: "#666",
    marginLeft: 4,
    fontWeight: "500",
  },
  starRating: {
    flexDirection: "row",
  },
  interactiveStar: {
    marginHorizontal: 2,
  },
  loadingReviews: {
    alignItems: "center",
    padding: 40,
  },
  loadingText: {
    fontSize: 14,
    color: "#666",
    marginTop: 10,
  },
  noReviews: {
    alignItems: "center",
    padding: 30,
  },
  noReviewsText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
    marginTop: 10,
  },
  noReviewsSubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 4,
    textAlign: "center",
    marginBottom: 15,
  },
  beFirstReviewButton: {
    backgroundColor: "#00BFFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  beFirstReviewText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  relatedSection: {
    marginBottom: 80,
  },
  relatedProductsList: {
    paddingRight: 60,
  },
  relatedProductCard: {
    width: 150,
    marginRight: 15,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  relatedProductImage: {
    width: "100%",
    height: 100,
    borderRadius: 8,
    marginBottom: 8,
  },
  relatedProductName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
    lineHeight: 16,
  },
  relatedProductPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: "#00BFFF",
  },
  relatedProductStock: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 20,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "90%",
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: "#333",
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: "#f5f5f5",
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  modalSendButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: "#00BFFF",
    gap: 8,
  },
  modalSendDisabled: {
    backgroundColor: "#ccc",
  },
  modalSendText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});