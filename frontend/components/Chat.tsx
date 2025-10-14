import React, { useState, useEffect, useRef } from 'react';
import { Language, ChatMessage, DiseaseDetectionResult } from '../types';
import { sendMessageToChat } from '../services/geminiService';
import ChatIcon from './icons/ChatIcon';
import SendIcon from './icons/SendIcon';

interface ChatProps {
  t: Record<string, string>;
  language: Language;
  analysisResult: DiseaseDetectionResult;
}

const Chat: React.FC<ChatProps> = ({ t, language, analysisResult }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const greeting = t.chatGreeting.replace('{diseaseName}', analysisResult.diseaseName);
    const initialMessage: ChatMessage = {
      role: 'model',
      text: greeting
    };
    setMessages([initialMessage]);
  }, [language, analysisResult, t.chatGreeting]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', text: inputValue };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputValue('');
    setIsLoading(true);

    try {
      const history = newMessages.slice(0, -1);
      const modelResponseText = await sendMessageToChat(userMessage.text, history, t);
      const modelMessage: ChatMessage = { role: 'model', text: modelResponseText };
      setMessages(prev => [...prev, modelMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessageText = error instanceof Error ? error.message : t.chatError;
      const errorMessage: ChatMessage = { role: 'model', text: errorMessageText };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-6 border-t border-brand-brown-dark/20 pt-4 animate-fade-in">
      {/* Header */}
      <header className="flex items-center gap-2 mb-3">
          <ChatIcon className="h-6 w-6 text-brand-green-dark" />
          <h3 className="text-lg font-bold text-brand-green-dark font-serif">{t.agroChat}</h3>
      </header>

      {/* Messages */}
      <div className="max-h-64 overflow-y-auto p-4 space-y-4 bg-brand-background rounded-lg custom-scrollbar">
          {messages.map((msg, index) => (
            <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'model' && <div className="w-8 h-8 rounded-full bg-brand-green-light flex items-center justify-center flex-shrink-0"><ChatIcon className="w-5 h-5 text-brand-green-dark"/></div>}
              <div className={`max-w-[85%] p-3 rounded-2xl ${msg.role === 'user' ? 'bg-brand-green text-white rounded-br-none' : 'bg-brand-surface text-brand-text shadow-sm rounded-bl-none'}`}>
                <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start items-end gap-2">
              <div className="w-8 h-8 rounded-full bg-brand-green-light flex items-center justify-center flex-shrink-0"><ChatIcon className="w-5 h-5 text-brand-green-dark"/></div>
              <div className="max-w-[85%] p-3 rounded-2xl bg-brand-surface text-brand-text shadow-sm rounded-bl-none">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-brand-green rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-2 h-2 bg-brand-green rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-2 h-2 bg-brand-green rounded-full animate-bounce"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <footer className="mt-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder={t.chatPlaceholder}
            className="flex-grow px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-green"
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !inputValue.trim()}
            className="bg-brand-green text-white p-3 rounded-full hover:bg-brand-green-dark disabled:bg-brand-green/50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg hover:-translate-y-px"
          >
            <SendIcon className="w-5 h-5" />
          </button>
        </div>
      </footer>
    </div>
  );
};

export default Chat;