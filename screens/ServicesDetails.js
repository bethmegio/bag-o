import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../supabaseClient';

export default function ServicesDetails({ navigation, route }) {
  const { service } = route.params || {};
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [newReview, setNewReview] = useState({ rating: 5, comment: '' });
  const [submitting, setSubmitting] = useState(false);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [replies, setReplies] = useState({});
  
  // ========== ADD CONVERSATIONS STATE ==========
  const [conversations, setConversations] = useState({});
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [expandedConversations, setExpandedConversations] = useState({});
  
  const serviceImages = {
    'Pool Cleaning': 'https://images.unsplash.com/photo-1575429198097-0414ec08e8cd?w=800&q=80',
    'Maintenance': 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
    'Repair': 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=800&q=80',
    'Installation': 'https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=800&q=80',
    'Consultation': 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&q=80',
    'Landscaping': 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=800&q=80',
    'Design': 'https://images.unsplash.com/photo-1494522358652-c549345d2c9e?w=800&q=80',
    'Inspection': 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&q=80',
    'default': 'https://images.unsplash.com/photo-1560743641-3914f2c45636?w=800&q=80'
  };

  // ========== FUNCTION DEFINITIONS ==========
  
  const loadUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    } catch (error) {
      console.error('Error loading user:', error);
    }
  };

  const fetchRepliesForReviews = async (reviewsData) => {
    if (!reviewsData || reviewsData.length === 0) return;
    
    try {
      const reviewIds = reviewsData.map(review => review.id);
      const { data: replyData, error } = await supabase
        .from("service_review_replies")
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

  // ========== ADD FUNCTION TO FETCH CONVERSATIONS ==========
  const fetchConversationsForReviews = async (reviewsData) => {
    if (!reviewsData || reviewsData.length === 0) return;
    
    try {
      const reviewIds = reviewsData.map(review => review.id);
      const { data: convData, error } = await supabase
        .from("service_review_conversations")
        .select("*")
        .in("review_id", reviewIds)
        .order("created_at", { ascending: true });
      
      if (error && error.code !== '42P01') {
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

  // ========== ADD FUNCTION TO SUBMIT USER REPLY ==========
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
        .from("service_review_conversations")
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

  const loadReviews = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('service_reviews')
        .select('*')
        .eq('service_id', service.id)
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });

      if (error) {
        console.log('Error loading service reviews:', error);
        setReviews([]);
        calculateRating([]);
      } else if (data && data.length > 0) {
        const formattedReviews = data.map(review => ({
          ...review,
          user_display_name: review.user_name || getDisplayName(review),
          is_verified_purchase: review.is_verified_service || false
        }));
        
        setReviews(formattedReviews);
        calculateRating(formattedReviews);
        await fetchRepliesForReviews(formattedReviews);
        await fetchConversationsForReviews(formattedReviews);
      } else {
        setReviews([]);
        calculateRating([]);
      }
    } catch (error) {
      console.error('Error loading service reviews:', error);
      setReviews([]);
      calculateRating([]);
    } finally {
      setLoading(false);
    }
  };

  const loadRelatedProducts = async () => {
    try {
      setLoadingRelated(true);
      
      if (service.category) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('category', service.category)
          .limit(5);

        if (error) {
          console.error('Error loading related products:', error);
          setRelatedProducts([]);
        } else {
          setRelatedProducts(data || []);
        }
      } else {
        setRelatedProducts([]);
      }
    } catch (error) {
      console.error('Error in loadRelatedProducts:', error);
      setRelatedProducts([]);
    } finally {
      setLoadingRelated(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReviews();
    setRefreshing(false);
  };

  const getDisplayName = (review) => {
    if (review.user_id) {
      return 'Verified Customer';
    }
    return 'Anonymous';
  };

  const calculateRating = (reviewsData) => {
    if (!reviewsData || reviewsData.length === 0) {
      setAverageRating(0);
      setTotalReviews(0);
      return;
    }
    
    const total = reviewsData.reduce((sum, review) => sum + review.rating, 0);
    const average = total / reviewsData.length;
    setAverageRating(average);
    setTotalReviews(reviewsData.length);
  };

  const submitReview = async () => {
    if (!user) {
      Alert.alert("Login Required", "Please login to leave a review");
      return;
    }

    if (!newReview.comment.trim() || newReview.comment.trim().length < 10) {
      Alert.alert("Review too short", "Please write a more detailed review (minimum 10 characters)");
      return;
    }

    try {
      setSubmitting(true);
      
      const userName = user.user_metadata?.full_name || 
                      user.email?.split("@")[0] || 
                      "Anonymous";

      const { data: existingReview } = await supabase
        .from("service_reviews")
        .select("*")
        .eq("service_id", service.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingReview) {
        const { data: updatedReview, error: updateError } = await supabase
          .from("service_reviews")
          .update({
            rating: newReview.rating,
            comment: newReview.comment.trim(),
            updated_at: new Date().toISOString(),
            user_name: userName
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
            user_display_name: userName,
            user_name: userName,
            is_verified_purchase: updatedReview.is_verified_service || false
          };
          setReviews(reviews.map(r => 
            r.id === existingReview.id ? reviewObj : r
          ));
          Alert.alert("Success", "Review updated!");
          resetForm();
        }
      } else {
        const { data: newReviewData, error: insertError } = await supabase
          .from("service_reviews")
          .insert({
            service_id: service.id,
            user_id: user.id,
            rating: newReview.rating,
            comment: newReview.comment.trim(),
            user_name: userName,
            helpful_count: 0,
            is_verified_service: false,
            status: 'pending'
          })
          .select()
          .single();

        if (insertError) {
          console.error("Insert error:", insertError);
          Alert.alert("Error", "Failed to submit review. Please try again.");
        } else {
          const reviewObj = {
            ...newReviewData,
            user_display_name: userName,
            user_name: userName,
            is_verified_purchase: newReviewData.is_verified_service || false
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
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setNewReview({ rating: 5, comment: "" });
    setShowReviewForm(false);
    setTimeout(() => {
      loadReviews();
    }, 500);
  };

  const handleBookNow = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        Alert.alert('Login Required', 'Please login to book this service');
        return;
      }

      navigation.navigate('Booking', { service });
    } catch (error) {
      console.error('Auth error:', error);
      Alert.alert('Error', 'Unable to process booking');
    }
  };

  const getUserDisplayName = (review) => {
    return review.user_display_name || review.user_name || 'Anonymous User';
  };

  const getServiceImage = () => {
    if (service.image_url) return { uri: service.image_url };
    
    const category = service.category || 'default';
    const imageUrl = serviceImages[category] || serviceImages['default'];
    return { uri: imageUrl };
  };

  const toggleConversation = (reviewId) => {
    setExpandedConversations(prev => ({
      ...prev,
      [reviewId]: !prev[reviewId]
    }));
  };

  // ========== ADD CONVERSATION THREAD RENDERER ==========
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
                    if (!user) {
                      Alert.alert("Login Required", "Please login to reply", [
                        { text: "Login", onPress: () => navigation.navigate("Login") },
                        { text: "Cancel", style: "cancel" },
                      ]);
                      return;
                    }
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
                      if (!user) {
                        Alert.alert("Login Required", "Please login to reply", [
                          { text: "Login", onPress: () => navigation.navigate("Login") },
                          { text: "Cancel", style: "cancel" },
                        ]);
                        return;
                      }
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

  // ========== UPDATED ADMIN REPLY RENDERER WITH THREAD ==========
  const renderAdminReply = (review) => {
    const reply = replies[review.id];
    const hasConversation = reply || (conversations[review.id] && conversations[review.id].length > 0);
    
    if (!hasConversation) return null;
    
    return renderConversationThread(review.id, reply);
  };

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

  // ========== MAIN USEEFFECT ==========
  useEffect(() => {
    loadUser();
    loadRelatedProducts();
    loadReviews();

    // Real-time subscription for service reviews
    const serviceReviewsSubscription = supabase
      .channel('service-reviews-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_reviews',
          filter: `service_id=eq.${service.id}`,
        },
        (payload) => {
          console.log('🔄 Service review changed:', payload);
          loadReviews();
        }
      )
      .subscribe();

    // Real-time subscription for replies
    const repliesSubscription = supabase
      .channel('service-replies-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_review_replies',
        },
        () => {
          loadReviews();
        }
      )
      .subscribe();

    // Real-time subscription for conversations
    const conversationsSubscription = supabase
      .channel('service-conversations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_review_conversations',
        },
        () => {
          loadReviews();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(serviceReviewsSubscription);
      supabase.removeChannel(repliesSubscription);
      supabase.removeChannel(conversationsSubscription);
    };
  }, [service.id]);

  useFocusEffect(
    useCallback(() => {
      loadReviews();
      return () => {};
    }, [service.id])
  );

  // ========== RENDER LOGIC ==========
  if (!service) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={64} color="#EF4444" />
          <Text style={styles.errorText}>No service data available</Text>
          <TouchableOpacity 
            style={styles.backButtonError}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonErrorText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#00BFFF"]} />
        }
      >
        {/* Header Image Section */}
        <View style={styles.headerContainer}>
          <Image 
            source={getServiceImage()} 
            style={styles.headerImage}
            resizeMode="cover"
          />
          <View style={styles.imageOverlay} />
          
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          
          <View style={styles.headerContent}>
            <Text style={styles.serviceName}>{service.name}</Text>
            <Text style={styles.serviceCategory}>{service.category || 'Service'}</Text>
            <View style={styles.headerRating}>
              <Ionicons name="star" size={16} color="#FFD700" />
              <Text style={styles.headerRatingText}>
                {averageRating.toFixed(1)} ({totalReviews} reviews)
              </Text>
            </View>
          </View>
        </View>

        {/* Service Details Card */}
        <View style={styles.serviceCard}>
          <Text style={styles.sectionTitle}>Service Details</Text>
          <Text style={styles.description}>
            {service.description || 'Professional service with expert care and attention to detail.'}
          </Text>
          
          <View style={styles.details}>
            <View style={styles.detailItem}>
              <Ionicons name="time-outline" size={20} color="#2e4dc8" />
              <Text style={styles.detailText}>{service.duration || 'Flexible Schedule'}</Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#2e4dc8" />
              <Text style={styles.detailText}>
                {service.available !== false ? 'Available Now' : 'Check Availability'}
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity 
            style={styles.bookButton}
            onPress={handleBookNow}
          >
            <LinearGradient
              colors={['#4ab8eb', '#2e4dc8']}
              style={styles.bookButtonInner}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="calendar-sharp" size={20} color="#fff" />
              <Text style={styles.bookButtonText}>Book This Service</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Reviews Section */}
        <View style={styles.reviewsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Customer Reviews</Text>
            <View style={styles.ratingSummary}>
              <Text style={styles.ratingNumber}>{averageRating.toFixed(1)}</Text>
              {renderStarRating(Math.round(averageRating))}
              <Text style={styles.ratingCount}>{totalReviews} reviews</Text>
            </View>
          </View>

          {/* Write Review Button */}
          <TouchableOpacity 
            style={styles.writeReviewButton}
            onPress={() => setShowReviewForm(!showReviewForm)}
          >
            <LinearGradient
              colors={['#4ab8eb', '#2e4dc8']}
              style={styles.writeReviewGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="create-outline" size={20} color="#fff" />
              <Text style={styles.writeReviewText}>
                {showReviewForm ? 'Cancel Review' : 'Write a Review'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Review Form */}
          {showReviewForm && (
            <View style={styles.reviewForm}>
              <Text style={styles.reviewFormTitle}>Share Your Experience</Text>
              
              <Text style={styles.ratingLabel}>Your Rating</Text>
              <View style={styles.starRating}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setNewReview({...newReview, rating: star})}
                  >
                    <Ionicons
                      name={star <= newReview.rating ? "star" : "star-outline"}
                      size={32}
                      color={star <= newReview.rating ? "#FFD700" : "#ccc"}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.ratingLabel}>Your Review</Text>
              <TextInput
                style={styles.reviewInput}
                placeholder="Share your experience with this service..."
                placeholderTextColor="#94A3B8"
                value={newReview.comment}
                onChangeText={(text) => setNewReview({...newReview, comment: text})}
                multiline
                numberOfLines={4}
              />
              <Text style={styles.charCount}>
                {newReview.comment.length}/500 characters
              </Text>

              <TouchableOpacity 
                style={[styles.submitButton, (submitting || newReview.comment.length < 10) && styles.submitButtonDisabled]}
                onPress={submitReview}
                disabled={submitting || newReview.comment.length < 10}
              >
                <LinearGradient
                  colors={['#4ab8eb', '#2e4dc8']}
                  style={styles.submitGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send-outline" size={20} color="#fff" />
                  )}
                  <Text style={styles.submitText}>
                    {submitting ? 'Submitting...' : 'Submit Review'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* Reviews List */}
          {loading ? (
            <ActivityIndicator style={styles.loader} size="large" color="#2e4dc8" />
          ) : reviews.length > 0 ? (
            reviews.map((review) => (
              <View key={review.id} style={styles.reviewItem}>
                <View style={styles.reviewHeader}>
                  <View style={styles.reviewUser}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {getUserDisplayName(review).charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>{getUserDisplayName(review)}</Text>
                      <Text style={styles.reviewDate}>{formatDate(review.created_at)}</Text>
                    </View>
                  </View>
                  <View style={styles.reviewStars}>
                    {renderStarRating(review.rating)}
                  </View>
                </View>
                
                <Text style={styles.reviewComment}>{review.comment}</Text>
                
                {/* Admin Reply with Conversation Thread */}
                {renderAdminReply(review)}
                
                {/* Add Reply Button for Original Review */}
                <TouchableOpacity 
                  style={styles.replyToReviewButton}
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
                      replyingTo: getUserDisplayName(review)
                    });
                    setShowReplyModal(true);
                  }}
                >
                  <Ionicons name="chatbubble-outline" size={14} color="#00BFFF" />
                  <Text style={styles.replyToReviewText}>Reply to Review</Text>
                </TouchableOpacity>
                
                {review.is_verified_purchase && (
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                    <Text style={styles.verifiedText}>Verified Service</Text>
                  </View>
                )}
              </View>
            ))
          ) : (
            <View style={styles.noReviewsContainer}>
              <Ionicons name="chatbubble-outline" size={48} color="#CBD5E1" />
              <Text style={styles.noReviewsTitle}>No Reviews Yet</Text>
              <Text style={styles.noReviewsText}>
                Be the first to share your experience with this service
              </Text>
            </View>
          )}
        </View>

        {/* Footer Note */}
        <View style={styles.footerNote}>
          <Ionicons name="shield-checkmark-outline" size={20} color="#2e4dc8" />
          <Text style={styles.footerNoteText}>
              Professional services with quality guarantee and certified expertise
          </Text>
        </View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerContainer: {
    height: 300,
    position: 'relative',
  },
  headerImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
  },
  serviceName: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 5,
  },
  serviceCategory: {
    fontSize: 16,
    color: '#fff',
    backgroundColor: 'rgba(74, 184, 235, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    fontWeight: '600',
    marginBottom: 12,
  },
  headerRating: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  headerRatingText: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '600',
    marginLeft: 6,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#1E293B',
    marginTop: 16,
    marginBottom: 24,
  },
  backButtonError: {
    backgroundColor: '#2e4dc8',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  backButtonErrorText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  serviceCard: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginTop: -0,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
    marginBottom: 20,
  },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailText: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 8,
    fontWeight: '500',
  },
  quickActions: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  bookButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  bookButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  bookButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
  },
  reviewsSection: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  ratingSummary: {
    alignItems: 'center',
  },
  ratingNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
  },
  ratingStars: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  ratingCount: {
    fontSize: 12,
    color: '#64748B',
  },
  writeReviewButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
  },
  writeReviewGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  writeReviewText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  reviewForm: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reviewFormTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
  },
  ratingLabel: {
    fontSize: 16,
    color: '#475569',
    fontWeight: '600',
    marginBottom: 8,
  },
  starRating: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 8,
  },
  reviewInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1E293B',
    marginBottom: 8,
    minHeight: 120,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  charCount: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'right',
    marginBottom: 16,
  },
  submitButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  reviewItem: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  reviewUser: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2e4dc8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  reviewDate: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
  },
  reviewComment: {
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
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
  replyToReviewButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F0F9FF",
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  replyToReviewText: {
    fontSize: 12,
    color: "#00BFFF",
    marginLeft: 6,
    fontWeight: "500",
  },
  adminReplyContainer: {
    backgroundColor: '#F0F9FF',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#00BFFF',
  },
  adminReplyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  adminReplyLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#00BFFF',
    marginLeft: 6,
  },
  adminReplyText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
    marginBottom: 6,
  },
  adminReplyDate: {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#10B98110',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#10B98130',
  },
  verifiedText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
    marginLeft: 4,
  },
  noReviewsContainer: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  noReviewsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginTop: 16,
    marginBottom: 8,
  },
  noReviewsText: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
  },
  loader: {
    marginVertical: 40,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    margin: 16,
    backgroundColor: '#F0F9FF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0F2FE',
  },
  footerNoteText: {
    flex: 1,
    fontSize: 14,
    color: '#0369A1',
    fontWeight: '500',
    marginLeft: 12,
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