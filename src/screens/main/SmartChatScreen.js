import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Platform,
  StatusBar,
  RefreshControl,
  Alert,
  Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants/colors';
import { ChatStorageService } from '../../services/ChatStorageService';

export default function SmartChatScreen({ navigation }) {
  const [conversations, setConversations] = useState([]);
  const [filteredConversations, setFilteredConversations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState('recent');
  const [refreshing, setRefreshing] = useState(false);

  // Load conversations when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('SmartChatScreen focused - loading conversations');
      loadConversations();
    }, [])
  );

  // Also load on initial mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Filter conversations when dependencies change
  useEffect(() => {
    filterConversations();
  }, [conversations, searchQuery, showArchived, sortBy]);

  const loadConversations = async () => {
    try {
      console.log('Loading conversations...');
      const data = await ChatStorageService.getConversations();
      console.log(`Loaded ${data.length} conversations`);
      setConversations(data);
    } catch (error) {
      console.log('Error loading conversations:', error);
      Alert.alert('Error', 'Failed to load conversations');
    }
  };

  const onRefresh = useCallback(async () => {
    console.log('Manual refresh triggered');
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  }, []);

  const filterConversations = () => {
    let filtered = conversations.filter(conv => 
      showArchived ? conv.archived : !conv.archived
    );

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(conv =>
        conv.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort
    filtered.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt);
      const dateB = new Date(b.updatedAt || b.createdAt);
      return sortBy === 'recent' ? dateB - dateA : dateA - dateB;
    });

    setFilteredConversations(filtered);
  };

  const handleNewConversation = () => {
    navigation.navigate('ChatConversation', { 
      conversationId: null,
      conversationTitle: 'New Conversation' 
    });
  };

  const handleConversationPress = (conversation) => {
    navigation.navigate('ChatConversation', { 
      conversationId: conversation.id,
      conversationTitle: conversation.title 
    });
  };

  const handleDeleteConversation = (conversationId) => {
    Alert.alert(
      'Delete Conversation',
      'Are you sure you want to delete this conversation? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await ChatStorageService.deleteConversation(conversationId);
            await loadConversations(); // Refresh immediately after delete
          },
        },
      ]
    );
  };

  const handleArchiveConversation = async (conversationId, archived) => {
    await ChatStorageService.archiveConversation(conversationId, !archived);
    await loadConversations(); // Refresh immediately after archive
  };

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString();
  };

    const renderConversationCard = ({ item }) => (
    <TouchableOpacity
        style={styles.conversationCard}
        onPress={() => handleConversationPress(item)}
        activeOpacity={0.7}
    >
        <View style={styles.conversationIconWrapper}>
        <View style={styles.conversationIcon}>
            <Ionicons name="chatbubble-ellipses" size={24} color={COLORS.primary} />
        </View>
        </View>

        <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
            <Text style={styles.conversationTitle} numberOfLines={1}>
            {item.title || 'New Conversation'}
            </Text>
            <Text style={styles.conversationTime}>
            {formatTimeAgo(item.updatedAt || item.createdAt)}
            </Text>
        </View>

        <Text style={styles.conversationPreview} numberOfLines={2}>
            {item.lastMessage || 'Start a conversation...'}
        </Text>

        <View style={styles.conversationFooter}>
            <View style={styles.messageCountBadge}>
            <Text style={styles.messageCountText}>
                {item.messageCount || 0} messages
            </Text>
            </View>

            <View style={styles.conversationActions}>
            <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleArchiveConversation(item.id, item.archived)}
            >
                <Ionicons 
                name={item.archived ? "archive" : "archive-outline"} 
                size={20} 
                color={COLORS.textSecondary} 
                />
            </TouchableOpacity>
            <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleDeleteConversation(item.id)}
            >
                <Ionicons name="trash-outline" size={20} color={COLORS.error} />
            </TouchableOpacity>
            </View>
        </View>
        </View>
    </TouchableOpacity>
    );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrapper}>
        <Ionicons name="chatbubbles-outline" size={64} color={COLORS.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>No conversations yet</Text>
      <Text style={styles.emptySubtitle}>
        Start a conversation to get career guidance and interview preparation support
      </Text>
      <TouchableOpacity style={styles.emptyButton} onPress={handleNewConversation}>
        <Text style={styles.emptyButtonText}>Start Chatting</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.inkDark} />

      {/* Fixed Hero Header */}
      <LinearGradient
        colors={[COLORS.inkDark, COLORS.inkSoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.heroHeader}
      >
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle}>Smart Chat</Text>
          <Text style={styles.heroTitle2}>AI Career Coach</Text>
          <Text style={styles.heroSub}>
            Career guidance · Interview prep
          </Text>
        </View>
        <View style={styles.heroDeco1} />
        <View style={styles.heroDeco2} />
      </LinearGradient>

      <View style={styles.contentSheet}>

      {/* New Conversation Button */}
      <View style={styles.newConversationContainer}>
        <TouchableOpacity 
          style={styles.newConversationButton}
          onPress={handleNewConversation}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle" size={20} color={COLORS.white} />
          <Text style={styles.newConversationText}>Start New Conversation</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={COLORS.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor={COLORS.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Controls */}
      <View style={styles.filterContainer}>
        <View style={styles.filterLeft}>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setSortBy(sortBy === 'recent' ? 'oldest' : 'recent')}
          >
            <Ionicons 
              name={sortBy === 'recent' ? 'arrow-down' : 'arrow-up'} 
              size={16} 
              color={COLORS.primary} 
            />
            <Text style={styles.filterButtonText}>
              {sortBy === 'recent' ? 'Recent' : 'Oldest'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filterRight}>
          <View style={styles.toggleContainer}>
            <Text style={styles.toggleLabel}>Show Archived</Text>
            <Switch
              value={showArchived}
              onValueChange={setShowArchived}
              trackColor={{ false: '#f0f0f0', true: COLORS.primary + '40' }}
              thumbColor={showArchived ? COLORS.primary : '#f4f3f4'}
              ios_backgroundColor="#f0f0f0"
            />
          </View>
        </View>
      </View>

      {/* Conversation Count */}
      <View style={styles.countContainer}>
        <Text style={styles.countText}>
          {filteredConversations.length} {showArchived ? 'Archived' : ''} Conversation{filteredConversations.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Conversations List */}
      <FlatList
        data={filteredConversations}
        renderItem={renderConversationCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.conversationsList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundSecondary,
  },
  // Fixed Hero Header (matching JobTrends)
  heroHeader: {
    paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 0) + 20,
    paddingBottom: 44, paddingHorizontal: 24,
    position: 'relative', overflow: 'hidden',
  },
  heroContent: { zIndex: 2 },
  heroTitle: { fontSize: 30, fontWeight: '900', color: COLORS.white, letterSpacing: -0.5 },
  heroTitle2: { fontSize: 30, fontWeight: '900', color: COLORS.primaryLight, letterSpacing: -0.5 },
  heroSub: {
    fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: '500', marginTop: 6,
  },
  heroDeco1: {
    position: 'absolute', right: -30, top: -30,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroDeco2: {
    position: 'absolute', right: 50, bottom: -50,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },

  // Content sheet with rounded top corners
  contentSheet: {
    flex: 1,
    backgroundColor: COLORS.backgroundSecondary,
    borderTopRightRadius: 30,
    marginTop: -20,
    overflow: 'hidden',
  },

  newConversationContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.background,
  },
  newConversationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  newConversationText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterLeft: {
    flexDirection: 'row',
    gap: 6,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: `${COLORS.primary}10`,
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  filterRight: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  countContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  conversationsList: {
    padding: 20,
    paddingBottom: 100,
  },
  conversationCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  conversationIconWrapper: {
    marginRight: 12,
  },
  conversationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${COLORS.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  conversationTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginRight: 8,
  },
  conversationTime: {
    fontSize: 11,
    color: COLORS.textTertiary,
  },
  conversationPreview: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  conversationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  messageCountBadge: {
    backgroundColor: `${COLORS.primary}10`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  messageCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
  conversationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  archiveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  archiveText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  deleteButton: {
    padding: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyIconWrapper: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 40,
  },
  emptyButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
});