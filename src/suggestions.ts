import fs from 'fs/promises';
import path from 'path';

const SUGGESTIONS_FILE = path.join(process.cwd(), 'data', 'suggestions.json');
const IDEAS_FILE = path.join(process.cwd(), 'data', 'ideas.md');

export interface Suggestion {
  id: string;
  userId: number;
  username?: string;
  firstName?: string;
  suggestion: string;
  category: 'feature' | 'bug' | 'improvement' | 'other';
  status: 'pending' | 'approved' | 'rejected' | 'implemented';
  createdAt: Date;
  votes: number;
  voters: number[];
}

export interface Idea {
  id: string;
  title: string;
  description: string;
  author: string;
  category: string;
  votes: number;
  status: 'proposed' | 'under-review' | 'planned' | 'in-progress' | 'completed' | 'rejected';
  createdAt: Date;
  comments: Array<{
    user: string;
    comment: string;
    createdAt: Date;
  }>;
}

class SuggestionsManager {
  private suggestions: Suggestion[] = [];
  private ideas: Idea[] = [];

  async loadSuggestions(): Promise<void> {
    try {
      const data = await fs.readFile(SUGGESTIONS_FILE, 'utf-8');
      this.suggestions = JSON.parse(data);
    } catch (error) {
      this.suggestions = [];
      await this.saveSuggestions();
    }
  }

  async saveSuggestions(): Promise<void> {
    await fs.writeFile(SUGGESTIONS_FILE, JSON.stringify(this.suggestions, null, 2));
  }

  async loadIdeas(): Promise<void> {
    try {
      const data = await fs.readFile(IDEAS_FILE, 'utf-8');
      // Parse do markdown ou manter como string
      this.ideas = JSON.parse(data);
    } catch (error) {
      this.ideas = [];
      await this.saveIdeas();
    }
  }

  async saveIdeas(): Promise<void> {
    await fs.writeFile(IDEAS_FILE, JSON.stringify(this.ideas, null, 2));
  }

  async addSuggestion(
    userId: number,
    suggestion: string,
    category: Suggestion['category'],
    username?: string,
    firstName?: string
  ): Promise<Suggestion> {
    const newSuggestion: Suggestion = {
      id: Date.now().toString(),
      userId,
      username,
      firstName,
      suggestion,
      category,
      status: 'pending',
      createdAt: new Date(),
      votes: 0,
      voters: []
    };

    this.suggestions.push(newSuggestion);
    await this.saveSuggestions();
    return newSuggestion;
  }

  async voteSuggestion(suggestionId: string, userId: number): Promise<boolean> {
    const suggestion = this.suggestions.find(s => s.id === suggestionId);
    if (!suggestion) return false;
    
    if (!suggestion.voters.includes(userId)) {
      suggestion.votes++;
      suggestion.voters.push(userId);
      await this.saveSuggestions();
      return true;
    }
    
    return false;
  }

  async getSuggestionsByStatus(status: Suggestion['status']): Promise<Suggestion[]> {
    return this.suggestions.filter(s => s.status === status);
  }

  async getTopSuggestions(limit = 10): Promise<Suggestion[]> {
    return this.suggestions
      .filter(s => s.status !== 'rejected')
      .sort((a, b) => b.votes - a.votes)
      .slice(0, limit);
  }

  async updateSuggestionStatus(
    suggestionId: string,
    status: Suggestion['status']
  ): Promise<boolean> {
    const suggestion = this.suggestions.find(s => s.id === suggestionId);
    if (!suggestion) return false;
    
    suggestion.status = status;
    await this.saveSuggestions();
    return true;
  }

  async addIdea(idea: Omit<Idea, 'id' | 'createdAt' | 'comments'>): Promise<Idea> {
    const newIdea: Idea = {
      ...idea,
      id: Date.now().toString(),
      createdAt: new Date(),
      comments: []
    };
    
    this.ideas.push(newIdea);
    await this.saveIdeas();
    return newIdea;
  }

  async voteIdea(ideaId: string, userId: number): Promise<boolean> {
    const idea = this.ideas.find(i => i.id === ideaId);
    if (!idea) return false;
    
    // Simples: apenas incrementa votos (sem controle de usuário por enquanto)
    idea.votes++;
    await this.saveIdeas();
    return true;
  }

  async addCommentToIdea(ideaId: string, user: string, comment: string): Promise<boolean> {
    const idea = this.ideas.find(i => i.id === ideaId);
    if (!idea) return false;
    
    idea.comments.push({
      user,
      comment,
      createdAt: new Date()
    });
    
    await this.saveIdeas();
    return true;
  }

  getStatistics() {
    return {
      totalSuggestions: this.suggestions.length,
      pending: this.suggestions.filter(s => s.status === 'pending').length,
      approved: this.suggestions.filter(s => s.status === 'approved').length,
      implemented: this.suggestions.filter(s => s.status === 'implemented').length,
      rejected: this.suggestions.filter(s => s.status === 'rejected').length,
      totalVotes: this.suggestions.reduce((sum, s) => sum + s.votes, 0),
      totalIdeas: this.ideas.length
    };
  }
}

export const suggestionsManager = new SuggestionsManager();